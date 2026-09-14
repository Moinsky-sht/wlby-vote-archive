import { prisma } from './prisma.js';
import type { Prisma } from './generated/prisma/client.js';
const slogan = '铸牢共同体 文创赋新篇——中华优秀传统文化与现代创意融合实践';
const mode = process.argv[2];
if (!['--dry-run', '--apply'].includes(mode)) throw new Error('Explicit operation mode required');
try {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT key FROM app_config WHERE key = 'config' FOR UPDATE`;
    const row = await tx.appConfig.findUnique({ where: { key: 'config' } });
    if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) throw new Error('Missing contest configuration');
    if (mode === '--apply') await tx.appConfig.update({ where: { key: 'config' }, data: {
      value: { ...(row.value as Record<string, Prisma.InputJsonValue>), slogan }
    } });
    console.log(JSON.stringify({ mode, slogan, changedKeys: ['slogan'], otherConfigPreserved: true }));
  });
} finally { await prisma.$disconnect(); }
