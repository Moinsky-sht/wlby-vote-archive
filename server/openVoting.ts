import { prisma } from './prisma.js';
import { votingRules } from './antiAbuse.js';
import type { Prisma } from './generated/prisma/client.js';

const mode = process.argv[2];
if (!['--dry-run','--apply','--reset-views'].includes(mode)) throw new Error('Explicit operation mode required');
try {
  const result = await prisma.$transaction(async tx => {
    const row = await tx.appConfig.findUnique({where:{key:'config'}});
    if(!row || typeof row.value !== 'object' || Array.isArray(row.value)) throw new Error('Missing contest config');
    const before = row.value as Record<string,Prisma.InputJsonValue>;
    const cutoff = new Date();
    const count = await tx.visit.count({where:{createdAt:{lte:cutoff}}});
    const works = await tx.work.count({where:{status:'published'}});
    if(works !== 25) throw new Error('Unexpected published work count');
    if(mode !== '--dry-run') {
      if(mode === '--apply') await tx.appConfig.update({where:{key:'config'},data:{value:{...before,voteStart:cutoff.toISOString(),voteEnd:'',rules:votingRules}}});
      // User-authorized reset limited to visits that already existed at the cutoff.
      await tx.visit.deleteMany({where:{createdAt:{lte:cutoff}}});
    }
    return {mode,publishedWorks:works,resetVisits:count,cutoff:cutoff.toISOString(),votesUnchanged:true};
  });
  console.log(JSON.stringify(result));
} finally {await prisma.$disconnect();}
