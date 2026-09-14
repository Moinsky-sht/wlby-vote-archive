import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { HttpError } from './httpError.js';
import type { Prisma } from './generated/prisma/client.js';

export const voteResetConfirmation = '清零全部票数';
// Shared by votes; exclusive for a reset. Always acquire before account locks.
export async function lockVoteEpoch(tx: Prisma.TransactionClient, exclusive = false) {
  if (exclusive) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('vote:epoch'))`;
  else await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext('vote:epoch'))`;
}

export interface VoteResetReceipt {
  requestId: string;
  resetAt: string;
  workCount: number;
  previousVotes: number;
  archivedRecords: number;
}

export async function resetAllVotes(adminId: string, ip: string, requestId: unknown, confirmation: unknown): Promise<VoteResetReceipt> {
  if (confirmation !== voteResetConfirmation || typeof requestId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new HttpError(400, '请输入“清零全部票数”后再确认', 'INVALID_RESET_CONFIRMATION');
  }
  const key = `vote-reset:${requestId.toLowerCase()}`;
  return prisma.$transaction(async (tx) => {
    await lockVoteEpoch(tx, true);
    const previous = await tx.appConfig.findUnique({ where: { key } });
    // Retrying an uncertain response must never clear votes from the new round.
    if (previous) return (previous.value as unknown as { receipt: VoteResetReceipt }).receipt;
    await tx.$executeRaw`LOCK TABLE works, vote_records, votes IN SHARE ROW EXCLUSIVE MODE`;
    const [works, records, legacyRecords] = await Promise.all([
      tx.work.findMany({ select: { id: true, code: true, votes: true }, orderBy: { id: 'asc' } }),
      tx.voteRecord.findMany({ orderBy: { id: 'asc' } }),
      tx.vote.findMany({ orderBy: { id: 'asc' } })
    ]);
    const receipt: VoteResetReceipt = {
      requestId, resetAt: new Date().toISOString(), workCount: works.length,
      previousVotes: works.reduce((sum, work) => sum + work.votes, 0),
      archivedRecords: records.length + legacyRecords.length
    };
    // Private, immutable archive in this project's DB. No voter data is returned.
    const snapshot = JSON.stringify({ works, records, legacyRecords });
    const sha256 = crypto.createHash('sha256').update(snapshot).digest('hex');
    await tx.appConfig.create({ data: { key, value: { version: 1, adminId, receipt: { ...receipt }, snapshot, sha256 } } });
    const saved = (await tx.appConfig.findUniqueOrThrow({ where: { key } })).value as { snapshot: string; sha256: string };
    if (saved.snapshot !== snapshot || crypto.createHash('sha256').update(saved.snapshot).digest('hex') !== sha256) {
      throw new Error('投票记录归档校验失败，本次未清零');
    }
    for (let i = 0; i < records.length; i += 1000) {
      const ids = records.slice(i, i + 1000).map((row) => row.id);
      const removed = await tx.voteRecord.deleteMany({ where: { id: { in: ids } } });
      if (removed.count !== ids.length) throw new Error('投票记录发生变化，本次未清零');
    }
    for (let i = 0; i < legacyRecords.length; i += 1000) {
      const ids = legacyRecords.slice(i, i + 1000).map((row) => row.id);
      const removed = await tx.vote.deleteMany({ where: { id: { in: ids } } });
      if (removed.count !== ids.length) throw new Error('历史投票记录发生变化，本次未清零');
    }
    if (works.length) await tx.work.updateMany({ where: { id: { in: works.map((work) => work.id) } }, data: { votes: 0 } });
    await tx.adminAuditLog.create({ data: {
      id: crypto.randomUUID(), adminUserId: adminId, action: 'reset_all_votes', ip,
      createdAt: new Date(receipt.resetAt), details: { archiveKey: key, ...receipt }
    } });
    return receipt;
  }, { maxWait: 10000, timeout: 60000 });
}
