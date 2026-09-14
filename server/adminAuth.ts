import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';
import { unauthorized } from './httpError.js';
import { sessionCookieOptions } from './cookieOptions.js';

export const adminSessionCookie = 'bj_vote_admin_session';
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const bcryptRounds = 12;

function id(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(header?: string) {
  const cookies = new Map<string, string>();
  for (const part of (header || '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (!key) continue;
    cookies.set(key, decodeURIComponent(value.join('=')));
  }
  return cookies;
}

export async function upsertAdminUser(username: string, password: string) {
  const normalized = username.trim();
  if (!normalized || !password) throw new Error('管理员账号和密码不能为空');
  const passwordHash = await bcrypt.hash(password, bcryptRounds);
  const now = new Date();

  return prisma.adminUser.upsert({
    where: { username: normalized },
    create: {
      id: id('admin'),
      username: normalized,
      passwordHash,
      createdAt: now,
      updatedAt: now
    },
    update: {
      passwordHash,
      updatedAt: now
    }
  });
}

export async function loginAdmin(username: string, password: string, res: Response) {
  const normalized = username.trim();
  // Organizer-requested unlimited admin attempts. Authentication remains mandatory;
  // legacy admin throttle rows are intentionally ignored without deleting history.
  const user = await prisma.adminUser.findUnique({ where: { username: normalized } });
  if (!user) {
    throw unauthorized();
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw unauthorized();
  }

  await prisma.adminSession.deleteMany({
    where: {
      userId: user.id,
      expiresAt: { lt: new Date() }
    }
  });

  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionTtlMs);
  await prisma.adminSession.create({
    data: {
      id: id('admin_session'),
      userId: user.id,
      tokenHash: hashToken(token),
      createdAt: now,
      expiresAt,
      lastSeenAt: now
    }
  });

  res.setHeader('Set-Cookie', `${adminSessionCookie}=${encodeURIComponent(token)}; ${sessionCookieOptions(sessionTtlMs / 1000)}`);
  return { username: user.username };
}

export async function currentAdmin(req: Request) {
  const token = parseCookies(req.headers.cookie).get(adminSessionCookie);
  if (!token) return undefined;
  const tokenHash = hashToken(token);
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash },
    include: { user: true }
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    if (session) await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return undefined;
  }
  await prisma.adminSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() }
  });
  return session.user;
}

export async function logoutAdmin(req: Request, res: Response) {
  const token = parseCookies(req.headers.cookie).get(adminSessionCookie);
  if (token) {
    await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  res.setHeader('Set-Cookie', `${adminSessionCookie}=; ${sessionCookieOptions(0)}`);
}
