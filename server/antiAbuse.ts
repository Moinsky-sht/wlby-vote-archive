import crypto from 'node:crypto';
import { isIP } from 'node:net';
import type { Prisma } from './generated/prisma/client.js';

export const windowMs = 24 * 60 * 60 * 1000;
export const voteLimit = 3;
export const votingRules = '每个账号每24小时最多3票，可全部投给同一作品；每点击一次投1票，成功后不可撤回或改投。同一网络下的不同账号独立计算票数。系统禁止机器、外挂、脚本等刷票行为。';

export function normalizeIp(input: string) {
  let value = input.trim().toLowerCase();
  if (isIP(value) === 6) {
    value = new URL(`http://[${value}]/`).hostname.slice(1, -1);
    const mapped = value.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/);
    if (mapped) {
      const n = parseInt(mapped[1], 16) * 65536 + parseInt(mapped[2], 16);
      value = [Math.floor(n / 16777216), Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join('.');
    }
  }
  if (!isIP(value)) throw new Error('无法验证当前网络，请稍后重试');
  return value;
}

export function networkHash(ip: string) {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error('安全配置不可用');
  return crypto.createHmac('sha256', secret).update(`network:${normalizeIp(ip)}`).digest('hex');
}

export async function lockKeys(tx: Prisma.TransactionClient, keys: string[]) {
  for (const key of [...new Set(keys)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}

export async function voteAllowance(tx: Pick<Prisma.TransactionClient, 'voteRecord'>, userId: string, ipHash: string, now = new Date()) {
  const createdTime = { gt: new Date(now.getTime() - windowMs) };
  const [accountVotes, networkVotes] = await Promise.all([
    tx.voteRecord.count({ where: { userId, createdTime } }),
    tx.voteRecord.count({ where: { ipHash, createdTime } })
  ]);
  // Network counts remain available for audit/backward compatibility, not quotas.
  return { accountVotes, networkVotes, remaining: Math.max(0, voteLimit - accountVotes) };
}
