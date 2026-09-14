import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './prisma.js';

const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(dataDir, 'uploads'));
const assetsDir = path.resolve(process.env.ASSETS_DIR || path.join(process.cwd(), 'outputs/generated-component-backgrounds'));
const imageUrlPattern = /\.(png|jpe?g)$/i;

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function localPathForUrl(url: string) {
  if (url.startsWith('/assets/')) return path.join(assetsDir, url.slice('/assets/'.length));
  if (url.startsWith('/uploads/')) return path.join(uploadsDir, url.slice('/uploads/'.length));
  return undefined;
}

async function webpUrlFor(url?: string | null) {
  if (!url || !imageUrlPattern.test(url)) return undefined;
  const localPath = localPathForUrl(url);
  if (!localPath) return undefined;
  const webpPath = localPath.replace(imageUrlPattern, '.webp');
  if (!(await exists(webpPath))) return undefined;
  return url.replace(imageUrlPattern, '.webp');
}

async function main() {
  let workUpdates = 0;
  let mediaUpdates = 0;

  const works = await prisma.work.findMany({ select: { id: true, cover: true } });
  for (const work of works) {
    const cover = await webpUrlFor(work.cover);
    if (!cover || cover === work.cover) continue;
    await prisma.work.update({ where: { id: work.id }, data: { cover, updatedAt: new Date() } });
    workUpdates += 1;
  }

  const mediaRows = await prisma.workMedia.findMany({ select: { id: true, url: true, poster: true } });
  for (const media of mediaRows) {
    const url = await webpUrlFor(media.url);
    const poster = await webpUrlFor(media.poster);
    if (!url && !poster) continue;
    await prisma.workMedia.update({
      where: { id: media.id },
      data: {
        ...(url ? { url } : {}),
        ...(poster ? { poster } : {})
      }
    });
    mediaUpdates += 1;
  }

  console.log(JSON.stringify({ workUpdates, mediaUpdates }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
