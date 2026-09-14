import 'dotenv/config';
import { prisma } from './prisma.js';
import { ensureDb as ensureSqliteDb, readDb as readSqliteDb } from './sqliteStore.js';
import { readDb as readPostgresDb, type Database } from './store.js';

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

function assertEqual(label: string, source: unknown, target: unknown) {
  if (source !== target) {
    throw new Error(`${label} 不一致：SQLite=${source} PostgreSQL=${target}`);
  }
}

async function main() {
  ensureSqliteDb();
  const source = readSqliteDb();
  const target = await readPostgresDb();
  const sourceSummary = summarize(source);
  const targetSummary = summarize(target);

  for (const key of Object.keys(sourceSummary) as Array<keyof typeof sourceSummary>) {
    assertEqual(key, sourceSummary[key], targetSummary[key]);
  }

  const targetWorks = new Map(target.works.map((work) => [work.code, work]));
  for (const work of source.works) {
    const migrated = targetWorks.get(work.code);
    assertEqual(`作品 ${work.code} 存在`, true, Boolean(migrated));
    assertEqual(`作品 ${work.code} 票数`, work.votes, migrated?.votes);
    assertEqual(`作品 ${work.code} 状态`, work.status, migrated?.status);
    assertEqual(`作品 ${work.code} 媒体数`, work.media.length, migrated?.media.length);
  }

  console.log('SQLite summary:', sourceSummary);
  console.log('PostgreSQL summary:', targetSummary);
  console.log('PostgreSQL migration verification passed.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
