import 'dotenv/config';
import { prisma } from './prisma.js';
import { upsertAdminUser } from './adminAuth.js';

const usernameArg = process.argv.find((arg) => arg.startsWith('--username='))?.slice('--username='.length);
const passwordArg = process.argv.find((arg) => arg.startsWith('--password='))?.slice('--password='.length);
const username = usernameArg || process.env.ADMIN_INIT_USER;
const password = passwordArg || process.env.ADMIN_INIT_PASSWORD;

async function main() {
  if (!username || !password) {
    throw new Error('请提供 --username 和 --password，或设置 ADMIN_INIT_USER / ADMIN_INIT_PASSWORD');
  }
  const user = await upsertAdminUser(username, password);
  console.log(`Admin user initialized: ${user.username}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
