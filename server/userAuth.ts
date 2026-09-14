import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { forbidden, tooManyRequests } from './httpError.js';
import { assertLoginAllowed, recordLoginFailure, clearAccountLoginFailures } from './loginThrottle.js';
import { lockKeys, networkHash, normalizeIp, voteAllowance, windowMs } from './antiAbuse.js';

export interface AuthSession {
  userId: string;
  phone: string;
  email?: string;
  token: string;
  expiresAt: string;
}
export type AuthChannel = 'email' | 'phone';
export type AuthPurpose = 'register' | 'login';
const ttlMs = 10 * 60 * 1000;
function id(prefix: string) { return prefix + '_' + crypto.randomBytes(16).toString('hex'); }
function hashToken(token: string) { return crypto.createHash('sha256').update(token).digest('hex'); }
function hashCode(channel: AuthChannel, identifier: string, purpose: AuthPurpose, code: string) {
  if (!process.env.APP_SECRET) throw new Error('安全配置不可用');
  return crypto.createHmac('sha256', process.env.APP_SECRET).update([channel, identifier, purpose, code].join(':')).digest('hex');
}
export function normalizeIdentifier(channel: AuthChannel, input: string) {
  const value = input.trim().toLowerCase();
  if (channel === 'phone') {
    if (!/^1\d{10}$/.test(value)) throw new Error('请输入正确的手机号');
  } else if (value.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(value)) {
    throw new Error('请输入正确的邮箱地址');
  }
  return value;
}
function userWhere(channel: AuthChannel, identifier: string) {
  return channel === 'email' ? { email: identifier } : { phone: identifier };
}
export async function requestAuthCode(channel: AuthChannel, input: string, purpose: AuthPurpose, ip: string, deliver: (identifier: string, code: string) => Promise<void>) {
  if (channel === 'email' && purpose === 'register') throw forbidden('邮箱注册已关闭，请使用手机号注册');
  const identifier = normalizeIdentifier(channel, input), ipHash = networkHash(ip);
  const code = crypto.randomInt(100000, 1000000).toString();
  const recordId = await prisma.$transaction(async tx => {
    await lockKeys(tx, ['auth:ip:' + ipHash, 'auth:identity:' + channel + ':' + identifier, ...(channel === 'phone' ? ['auth:sms:budget'] : [])]);
    const now = new Date(), boundary = new Date(now.getTime() - windowMs);
    if (channel === 'phone') {
      const configuredLimit = Number(process.env.SMS_DAILY_SEND_LIMIT || 1000);
      const limit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 1000;
      const count = await tx.authVerification.count({ where: { channel: 'phone', createdAt: { gt: boundary } } });
      if (count >= limit) throw tooManyRequests('短信注册请求较多，请稍后再试');
    }
    const user = await tx.user.findUnique({ where: userWhere(channel, identifier) });
    if (purpose === 'register' && user) throw new Error('该账号已注册，请切换到登录');
    if (purpose === 'login' && !user) throw new Error('该账号尚未注册，请先注册');
    if (user && user.status !== 'active') throw forbidden('该账号已停用，请联系管理员');
    const [last, identityCount, ipCount] = await Promise.all([
      tx.authVerification.findFirst({ where: { channel, identifier }, orderBy: { createdAt: 'desc' } }),
      tx.authVerification.count({ where: { channel, identifier, createdAt: { gt: boundary } } }),
      // Shared campus networks have a short burst guard, not a daily user cap.
      tx.authVerification.count({ where: { ipHash, createdAt: { gt: new Date(now.getTime() - 60000) } } })
    ]);
    if (last && now.getTime() - last.createdAt.getTime() < 120000) throw tooManyRequests('验证码发送太频繁，请120秒后再试');
    if (identityCount >= 5) throw tooManyRequests('该账号24小时内验证码次数已用完，请稍后再试');
    if (ipCount >= 60) throw tooManyRequests('当前网络验证码请求较多，请稍等一分钟再试');
    const row = await tx.authVerification.create({ data: {
      id: id('verification'), channel, identifier, purpose, ipHash,
      codeHash: hashCode(channel, identifier, purpose, code), expiresAt: new Date(now.getTime() + ttlMs), createdAt: now
    } });
    return row.id;
  });
  try {
    await deliver(identifier, code);
    await prisma.authVerification.update({ where: { id: recordId }, data: { delivered: true } });
  } catch {
    await prisma.authVerification.update({ where: { id: recordId }, data: { usedAt: new Date() } }).catch(() => undefined);
    throw new Error(channel === 'email' ? '验证邮件发送失败，请稍后重试' : '短信服务暂不可用，请稍后重试');
  }
}

export async function verifyAuthCode(channel: AuthChannel, input: string, codeInput: string, purpose: AuthPurpose, ip: string, visitorId?: string): Promise<AuthSession> {
  if (channel === 'email' && purpose === 'register') throw forbidden('邮箱注册已关闭，请使用手机号注册');
  const identifier = normalizeIdentifier(channel, input), code = codeInput.trim(), ipHash = networkHash(ip), canonicalIp = normalizeIp(ip);
  await assertLoginAllowed('user', channel + ':' + identifier, canonicalIp);
  if (!/^\d{6}$/.test(code)) {
    await recordLoginFailure('user', channel + ':' + identifier, canonicalIp);
    throw new Error('请输入6位验证码');
  }
  const result = await prisma.$transaction(async tx => {
    await lockKeys(tx, ['auth:ip:' + ipHash, 'auth:identity:' + channel + ':' + identifier]);
    const now = new Date();
    const row = await tx.authVerification.findFirst({ where: { channel, identifier, purpose }, orderBy: { createdAt: 'desc' } });
    if (!row || row.usedAt || !row.delivered || row.expiresAt <= now || row.attempts >= 5) return { error: '验证码无效或已过期，请重新获取' } as const;
    if (!crypto.timingSafeEqual(Buffer.from(row.codeHash, 'hex'), Buffer.from(hashCode(channel, identifier, purpose, code), 'hex'))) {
      const attempts = row.attempts + 1;
      await tx.authVerification.update({ where: { id: row.id }, data: { attempts, ...(attempts >= 5 ? { usedAt: now } : {}) } });
      return { error: attempts >= 5 ? '验证码尝试次数过多，请重新获取' : '验证码错误' } as const;
    }
    let user = await tx.user.findUnique({ where: userWhere(channel, identifier) });
    if (purpose === 'register') {
      if (user) return { error: '该账号已注册，请切换到登录' } as const;
      user = await tx.user.create({ data: {
        id: id('user'), ...userWhere(channel, identifier), registrationIpHash: ipHash, status: 'active', createdTime: now, lastLoginTime: now
      } });
    }
    if (!user) return { error: '该账号尚未注册，请先注册' } as const;
    if (user.status !== 'active') return { error: '该账号已停用，请联系管理员' } as const;
    await tx.authVerification.update({ where: { id: row.id }, data: { usedAt: now } });
    await tx.user.update({ where: { id: user.id }, data: { lastLoginTime: now } });
    await tx.userLoginAudit.create({ data: { id: id('login'), userId: user.id, ip: canonicalIp, visitorId: visitorId?.slice(0, 120) || null, createdAt: now } });
    const token = crypto.randomBytes(32).toString('base64url'), expiresAt = new Date(now.getTime() + 7 * windowMs);
    await tx.userLoginSession.create({ data: { id: id('session'), userId: user.id, tokenHash: hashToken(token), createdAt: now, lastSeenAt: now, expiresAt } });
    return { session: { userId: user.id, phone: user.phone || '', email: user.email || undefined, token, expiresAt: expiresAt.toISOString() } } as const;
  });
  if ('error' in result) {
    await recordLoginFailure('user', channel + ':' + identifier, canonicalIp);
    throw new Error(result.error);
  }
  await clearAccountLoginFailures('user', channel + ':' + identifier);
  return result.session;
}

// Organizer-selected low-friction login: registration proves ownership once.
// Subsequent identifier-only login is intentionally not proof of current ownership.
export async function loginRegisteredUser(channel: AuthChannel, input: string, ip: string, visitorId?: string): Promise<AuthSession> {
  const identifier = normalizeIdentifier(channel, input), canonicalIp = normalizeIp(ip);
  // Login attempts are unlimited by organizer request; registration checks and
  // transactional per-account/per-network voting limits remain independent.
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: userWhere(channel, identifier) });
    if (!user) throw new Error('该账号尚未注册，请先完成验证码注册');
    if (user.status !== 'active') throw forbidden('该账号已停用，请联系管理员');
    const now = new Date(), expiresAt = new Date(now.getTime() + 7 * windowMs);
    const token = crypto.randomBytes(32).toString('base64url');
    await tx.user.update({ where: { id: user.id }, data: { lastLoginTime: now } });
    await tx.userLoginAudit.create({ data: { id: id('login'), userId: user.id, ip: canonicalIp, visitorId: visitorId?.slice(0,120) || null, createdAt: now } });
    await tx.userLoginSession.create({ data: { id: id('session'), userId: user.id, tokenHash: hashToken(token), createdAt: now, lastSeenAt: now, expiresAt } });
    return { userId: user.id, phone: user.phone || '', email: user.email || undefined, token, expiresAt: expiresAt.toISOString() };
  });
}

export async function findAuthSessionByToken(token?: string): Promise<AuthSession | undefined> {
  if (!token) return undefined;
  const session = await prisma.userLoginSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt.getTime() <= Date.now() || session.user.status !== 'active') return undefined;
  await prisma.userLoginSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  return { userId: session.user.id, phone: session.user.phone || '', email: session.user.email || undefined, token, expiresAt: session.expiresAt.toISOString() };
}
export async function logoutUser(token?: string) {
  if (!token) return;
  await prisma.userLoginSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}
export async function getUserProfile(userId: string, ip: string) {
  const [user, totalVotes, allowance] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.voteRecord.count({ where: { userId } }),
    voteAllowance(prisma, userId, networkHash(ip))
  ]);
  if (!user) throw new Error('账号不存在');
  const email = user.email || '';
  const maskedEmail = email ? email.slice(0, 2) + '***@' + email.split('@')[1] : '';
  const maskedPhone = user.phone ? user.phone.slice(0, 3) + '****' + user.phone.slice(-4) : '';
  return {
    phone: user.phone || '', email, maskedPhone, maskedEmail, maskedIdentifier: maskedPhone || maskedEmail,
    accountType: user.email ? '邮箱账号' : '手机号账号',
    createdTime: user.createdTime.toISOString(), lastLoginTime: user.lastLoginTime.toISOString(),
    totalVotes, todayVotes: allowance.accountVotes, networkVotes: allowance.networkVotes, todayRemaining: allowance.remaining
  };
}

export async function getUserVotes(userId: string) {
  const records = await prisma.voteRecord.findMany({
    where: { userId },
    include: { work: true },
    orderBy: { createdTime: 'desc' }
  });
  return records.map((record) => ({
    id: record.id,
    voteDate: record.voteDate,
    createdTime: record.createdTime.toISOString(),
    work: { id: record.work.id, code: record.work.code, title: record.work.title }
  }));
}

export async function listAdminUsers(searchInput = '') {
  const search = searchInput.trim();
  const users = await prisma.user.findMany({
    where: search ? { OR: [{ phone: { contains: search } }, { email: { contains: search, mode: 'insensitive' } }] } : undefined,
    include: { _count: { select: { voteRecords: true, sessions: true } } },
    orderBy: { createdTime: 'desc' },
    take: 200
  });
  return users.map((user) => ({
    id: user.id,
    phone: user.phone || '',
    email: user.email || '',
    identifier: user.phone || user.email || '',
    status: user.status,
    createdTime: user.createdTime.toISOString(),
    lastLoginTime: user.lastLoginTime.toISOString(),
    voteCount: user._count.voteRecords,
    sessionCount: user._count.sessions
  }));
}

export async function setUserStatus(adminUserId: string, userId: string, status: 'active' | 'disabled', ip: string) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status } });
    if (status === 'disabled') await tx.userLoginSession.deleteMany({ where: { userId } });
    await tx.adminAuditLog.create({
      data: {
        id: id('audit'),
        adminUserId,
        targetUserId: userId,
        action: status === 'active' ? 'enable_user' : 'disable_user',
        ip,
        createdAt: new Date()
      }
    });
  });
}
