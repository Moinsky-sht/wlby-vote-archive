import 'dotenv/config';
import fs from 'node:fs/promises';
import { prisma } from './prisma.js';
import type { Prisma } from './generated/prisma/client.js';
import type { Work } from './store.js';

// Deliberately restricted one-time import. Never truncates tables or replaces real votes.
const [inputPath, mode] = process.argv.slice(2);
if (!inputPath || !['--dry-run', '--apply'].includes(mode)) throw new Error('Specify works.json and --dry-run or --apply');
const works: Work[] = JSON.parse(await fs.readFile(inputPath, 'utf8'));
if (works.length !== 25 || new Set(works.map(w => w.id)).size !== 25 || new Set(works.map(w => w.code)).size !== 25) throw new Error('Expected exactly 25 unique works');
for (const w of works) {
  if (w.id !== `real_${w.code}` || !/^[A-D]\d{2,3}$/.test(w.code) || w.themeId !== w.code[0] || !w.title || !w.author || !w.description || w.votes !== 0 || w.status !== 'published') throw new Error(`Invalid work ${w.code}`);
  if (!w.media.length || !w.cover.startsWith(`/assets/${w.code}-cover-`) || w.media[0].url !== w.cover) throw new Error(`Invalid cover ${w.code}`);
  for (const m of w.media) if (!m.url.startsWith(`/assets/${w.code}-`) || !['image', 'video'].includes(m.type)) throw new Error(`Invalid media ${w.code}`);
  if (Object.keys(w.meta).some(k => !['category', 'school'].includes(k))) throw new Error('Unexpected private metadata');
}
const demoTitles = ['同心普法手册', '法护京韵', '中轴新生', '文脉流光', '青春同心徽章', '长城之歌', '品牌焕新计划', '融聚未来'];
const demoVotes = [1289, 985, 12680, 3120, 7654, 4210, 6432, 872];
const demoIds = demoTitles.map((_, i) => `work_${String(i + 1).padStart(2, '0')}`);
try {
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(726250908)`;
    await tx.$executeRawUnsafe('LOCK TABLE works, work_media, votes, vote_records, reports IN SHARE ROW EXCLUSIVE MODE');
    const existing = await tx.work.findMany();
    for (const row of existing) {
      const i = demoIds.indexOf(row.id);
      if (i >= 0) {
        if (row.title !== demoTitles[i] || row.code !== String(i + 1).padStart(2, '0') || row.votes !== demoVotes[i] || row.cover !== `/assets/WorkCover_${row.code}.webp`) throw new Error('Demo fingerprint changed; refusing removal');
      } else if (!works.some(w => w.id === row.id && w.code === row.code)) throw new Error('Unexpected existing real work; refusing replacement');
    }
    const where = { workId: { in: demoIds } };
    const references = await tx.vote.count({ where }) + await tx.voteRecord.count({ where }) + await tx.report.count({ where });
    if (references) throw new Error('Demo works have user data; refusing removal');
    const themes = await tx.theme.findMany();
    if (works.some(w => !themes.some(t => t.id === w.themeId))) throw new Error('Missing theme');
    const pending = works.filter(w => !existing.some(e => e.id === w.id));
    const summary = { mode, removeDemos: existing.filter(w => demoIds.includes(w.id)).length, addRealWorks: pending.length, media: pending.reduce((n, w) => n + w.media.length, 0), preservedExistingRealWorks: works.length - pending.length };
    if (mode === '--dry-run') return summary;
    await tx.work.deleteMany({ where: { id: { in: demoIds } } });
    for (const w of pending) {
      await tx.work.create({ data: {
        id: w.id, code: w.code, title: w.title, author: w.author, themeId: w.themeId,
        themeName: themes.find(t => t.id === w.themeId)!.name, type: w.type, cover: w.cover,
        description: w.description, status: 'published', votes: 0, displayOrder: w.displayOrder,
        createdAt: new Date(), updatedAt: new Date(), meta: w.meta as Prisma.InputJsonValue,
        media: { create: w.media.map(m => ({ id: m.id, type: m.type, url: m.url, poster: m.poster || null, title: m.title || null, sortOrder: m.order })) }
      } });
    }
    const row = await tx.appConfig.findUnique({ where: { key: 'config' } });
    const config = row?.value as Record<string, Prisma.InputJsonValue> | undefined;
    if (config?.voteStart === '2026-08-10T10:00:00+08:00' && config.voteEnd === '2026-08-13T09:59:59+08:00') {
      await tx.appConfig.update({ where: { key: 'config' }, data: { value: { ...config, voteStart: '', voteEnd: '' } } });
    }
    if (await tx.work.count() !== 25) throw new Error('Final count mismatch');
    return summary;
  }, { timeout: 30000 });
  console.log(JSON.stringify(result));
} finally {
  await prisma.$disconnect();
}
