import 'dotenv/config';
import { prisma } from './prisma.js';
import { ensureDb as ensureSqliteDb, readDb as readSqliteDb } from './sqliteStore.js';
import { readDb as readPostgresDb, writeDb as writePostgresDb, type Database } from './store.js';

function summarize(db: Database) {
  return {
    themes: db.themes.length,
    works: db.works.length,
    workMedia: db.works.reduce((sum, work) => sum + work.media.length, 0),
    votes: db.votes.length,
    visits: db.visits.length,
    reports: db.reports.length,
    workVoteTotal: db.works.reduce((sum, work) => sum + work.votes, 0)
  };
}

function diffSummary(source: ReturnType<typeof summarize>, target: ReturnType<typeof summarize>) {
  return Object.entries(source).filter(([key, value]) => target[key as keyof typeof target] !== value);
}

async function targetCounts() {
  const [appConfig, themes, works, workMedia, users, legacyVotes, voteRecords, visits, reports] = await Promise.all([
    prisma.appConfig.count(),
    prisma.theme.count(),
    prisma.work.count(),
    prisma.workMedia.count(),
    prisma.user.count(),
    prisma.vote.count(),
    prisma.voteRecord.count(),
    prisma.visit.count(),
    prisma.report.count()
  ]);
  return { appConfig, themes, works, workMedia, users, legacyVotes, voteRecords, visits, reports };
}

function assertWorkVotes(source: Database, target: Database) {
  const targetByCode = new Map(target.works.map((work) => [work.code, work]));
  const mismatches = source.works
    .map((work) => {
      const migrated = targetByCode.get(work.code);
      return migrated && migrated.votes === work.votes ? undefined : `${work.code}:${work.votes}->${migrated?.votes ?? 'missing'}`;
    })
    .filter(Boolean);

  if (mismatches.length) {
    throw new Error(`作品票数字段不一致：${mismatches.join(', ')}`);
  }
}

async function main() {
  const force = process.argv.includes('--force');
  ensureSqliteDb();
  const source = readSqliteDb();
  const before = await targetCounts();
  const targetHasData = Object.values(before).some((count) => count > 0);

  if (targetHasData && !force) {
    throw new Error(`PostgreSQL 目标库非空：${JSON.stringify(before)}。确认覆盖请添加 --force。`);
  }

  console.log('SQLite source summary:', summarize(source));
  if (targetHasData) console.log('PostgreSQL target will be replaced:', before);

  await writePostgresDb(source);

  const target = await readPostgresDb();
  const sourceSummary = summarize(source);
  const targetSummary = summarize(target);
  const mismatches = diffSummary(sourceSummary, targetSummary);
  if (mismatches.length) {
    throw new Error(`迁移后数量不一致：${JSON.stringify({ source: sourceSummary, target: targetSummary })}`);
  }
  assertWorkVotes(source, target);

  console.log('PostgreSQL target summary:', targetSummary);
  console.log('SQLite -> PostgreSQL migration completed.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
