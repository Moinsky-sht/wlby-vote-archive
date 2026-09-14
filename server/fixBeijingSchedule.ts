import { prisma } from './prisma.js';
import { normalizeContestTime, contestPhase } from './contestTime.js';
import type { Prisma } from './generated/prisma/client.js';

const apply = process.argv.includes('--apply');
if (new URL(process.env.DATABASE_URL || '').pathname !== '/h5_vote') throw new Error('Unexpected target database');
try {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT key FROM app_config WHERE key = 'config' FOR UPDATE`;
    const row = await tx.appConfig.findUniqueOrThrow({where:{key:'config'}});
    const current = row.value as Record<string, Prisma.JsonValue>;
    const start = '2026-09-08T08:00:00+08:00', end = '2026-09-14T00:00:00+08:00';
    if (normalizeContestTime(current.voteStart) !== start || normalizeContestTime(current.voteEnd) !== end) throw new Error('Schedule has changed since approval; stop for review');
    const updated={...current,voteStart:start,voteEnd:end};
    if (apply && (current.voteStart !== start || current.voteEnd !== end)) {
      await tx.appConfig.create({data:{key:'schedule-timezone-fix-20260909',value:{at:new Date().toISOString(),before:{voteStart:current.voteStart,voteEnd:current.voteEnd},after:{voteStart:start,voteEnd:end}}}});
      await tx.appConfig.update({where:{key:'config'},data:{value:updated}});
    }
    console.log(JSON.stringify({applied:apply,start,end,phase:contestPhase(updated),otherConfigPreserved:true}));
  });
} finally { await prisma.$disconnect(); }
