import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { tooManyRequests } from './httpError.js';

type LoginScope = 'user';
type ThrottleKind = 'account' | 'ip';

const windowMs = 15 * 60 * 1000;
const lockMs = 15 * 60 * 1000;
const limits: Record<LoginScope, Record<ThrottleKind, number>> = {
  user: { account: 10, ip: 30 }
};
const lockedMessage = '登录尝试过于频繁，请15分钟后再试';

function throttleKey(scope: LoginScope, kind: ThrottleKind, value: string) {
  return crypto.createHash('sha256').update(`${scope}:${kind}:${value.trim().toLowerCase()}`).digest('hex');
}

function descriptors(scope: LoginScope, identifier: string, ip: string) {
  return [
    { key: throttleKey(scope, 'account', identifier), kind: 'account' as const },
    { key: throttleKey(scope, 'ip', ip), kind: 'ip' as const }
  ];
}

export async function assertLoginAllowed(scope: LoginScope, identifier: string, ip: string) {
  const entries = descriptors(scope, identifier, ip);
  const rows = await prisma.loginThrottle.findMany({ where: { key: { in: entries.map((entry) => entry.key) } } });
  if (rows.some((row) => row.lockedUntil && row.lockedUntil.getTime() > Date.now())) {
    throw tooManyRequests(lockedMessage, 'LOGIN_RATE_LIMITED');
  }
}

export async function recordLoginFailure(scope: LoginScope, identifier: string, ip: string) {
  const entries = descriptors(scope, identifier, ip);
  const now = new Date();
  const windowBoundary = new Date(now.getTime() - windowMs);
  const locked = await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `login:${entry.key}`);
    }

    let shouldLock = false;
    for (const entry of entries) {
      const current = await tx.loginThrottle.findUnique({ where: { key: entry.key } });
      const withinWindow = current && current.windowStartedAt >= windowBoundary;
      const failures = withinWindow ? current.failures + 1 : 1;
      const alreadyLocked = Boolean(current?.lockedUntil && current.lockedUntil > now);
      const lockReached = failures >= limits[scope][entry.kind];
      const lockedUntil = alreadyLocked
        ? current?.lockedUntil
        : lockReached
          ? new Date(now.getTime() + lockMs)
          : null;

      await tx.loginThrottle.upsert({
        where: { key: entry.key },
        create: {
          key: entry.key,
          scope,
          kind: entry.kind,
          failures,
          windowStartedAt: now,
          lockedUntil,
          updatedAt: now
        },
        update: {
          failures,
          windowStartedAt: withinWindow ? current.windowStartedAt : now,
          lockedUntil,
          updatedAt: now
        }
      });
      shouldLock ||= alreadyLocked || lockReached;
    }
    return shouldLock;
  });

  if (locked) throw tooManyRequests(lockedMessage, 'LOGIN_RATE_LIMITED');
}

export async function clearAccountLoginFailures(scope: LoginScope, identifier: string) {
  await prisma.loginThrottle.deleteMany({
    where: { key: throttleKey(scope, 'account', identifier) }
  });
}
