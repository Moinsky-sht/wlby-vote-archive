import { prisma } from './prisma.js';
import { votingRules } from './antiAbuse.js';
import type { Prisma } from './generated/prisma/client.js';
const mode = process.argv[2];
if (!['--dry-run', '--apply'].includes(mode)) throw new Error('Explicit operation mode required');
const previousRules = '每个账号及同一公网IP下的所有手机号、邮箱账号，每24小时合计最多3票，可全部投给同一作品；每点击一次投1票，成功后不可撤回或改投。共享同一网络的用户共用IP额度。系统禁止机器、外挂、脚本等刷票行为。';
try {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT key FROM app_config WHERE key = 'config' FOR UPDATE`;
    const row = await tx.appConfig.findUnique({where:{key:'config'}});
    if (!row || !row.value || typeof row.value !== 'object' || Array.isArray(row.value)) throw new Error('Missing contest configuration');
    const before = row.value as Record<string, Prisma.InputJsonValue>;
    if (before.rules !== previousRules && before.rules !== votingRules) throw new Error('Rules changed manually; stop for review');
    if (mode === '--apply' && before.rules !== votingRules) {
      await tx.appConfig.update({where:{key:'config'},data:{value:{...before,rules:votingRules}}});
    }
    console.log(JSON.stringify({mode,rules:votingRules,voteSchedulePreserved:true,votesAndVisitsPreserved:true}));
  });
} finally {await prisma.$disconnect();}
