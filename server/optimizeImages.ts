import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(dataDir, 'uploads'));
const assetsDir = path.resolve(process.env.ASSETS_DIR || path.join(process.cwd(), 'outputs/generated-component-backgrounds'));
const imageExtPattern = /\.(png|jpe?g)$/i;

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectImages(directory: string) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectImages(fullPath)));
    } else if (entry.isFile() && imageExtPattern.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function webpPathFor(filePath: string) {
  return filePath.replace(imageExtPattern, '.webp');
}

async function optimizeImage(filePath: string, force: boolean) {
  const targetPath = webpPathFor(filePath);
  if (!force && (await exists(targetPath))) {
    return { filePath, targetPath, skipped: true, inputBytes: 0, outputBytes: 0 };
  }

  const inputStat = await fs.stat(filePath);
  await sharp(filePath, { animated: true, limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: 2200, height: 2200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 5, smartSubsample: true })
    .toFile(targetPath);
  const outputStat = await fs.stat(targetPath);
  return {
    filePath,
    targetPath,
    skipped: false,
    inputBytes: inputStat.size,
    outputBytes: outputStat.size
  };
}

async function main() {
  const force = process.argv.includes('--force');
  const files = [...(await collectImages(assetsDir)), ...(await collectImages(uploadsDir))];
  let converted = 0;
  let skipped = 0;
  let inputBytes = 0;
  let outputBytes = 0;

  for (const file of files) {
    const result = await optimizeImage(file, force);
    if (result.skipped) {
      skipped += 1;
      continue;
    }
    converted += 1;
    inputBytes += result.inputBytes;
    outputBytes += result.outputBytes;
    console.log(`${path.relative(process.cwd(), result.filePath)} -> ${path.relative(process.cwd(), result.targetPath)}`);
  }

  console.log(
    JSON.stringify({
      assetsDir,
      uploadsDir,
      converted,
      skipped,
      inputMB: Number((inputBytes / 1024 / 1024).toFixed(2)),
      outputMB: Number((outputBytes / 1024 / 1024).toFixed(2)),
      savedMB: Number(((inputBytes - outputBytes) / 1024 / 1024).toFixed(2))
    })
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
