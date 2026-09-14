import 'dotenv/config';
import { ensureDb, readDb } from './store.js';

await ensureDb();
const db = await readDb();

console.log('PostgreSQL database initialized via Prisma.');
console.log(`Themes: ${db.themes.length}`);
console.log(`Works: ${db.works.length}`);
console.log(`Votes: ${db.votes.length}`);
console.log(`Visits: ${db.visits.length}`);
console.log(`Reports: ${db.reports.length}`);
