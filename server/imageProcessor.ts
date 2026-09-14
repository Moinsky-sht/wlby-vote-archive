import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const ffmpegPath = process.env.FFMPEG_PATH || '/usr/bin/ffmpeg';

export type UploadPurpose = 'cover' | 'media';

export const A3_COVER_WIDTH = 1200;
export const A3_COVER_HEIGHT = 1697;

const rasterExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.heif', '.tif', '.tiff', '.svg']);
const rasterMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/tiff',
  'image/svg+xml'
]);
const passthroughExtensions = new Set(['.mp4', '.mov', '.webm', '.pdf']);
const videoExtensions = new Set(['.mp4', '.mov', '.webm']);
const videoMimeTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const targetVideoBytes = 88 * 1024 * 1024;
const maximumVideoBytes = 95 * 1024 * 1024;

async function isRasterFile(buffer: Buffer, originalName: string, mimeType?: string) {
  if (rasterMimeTypes.has(mimeType || '') || rasterExtensions.has(path.extname(originalName).toLowerCase())) return true;
  try {
    return Boolean((await sharp(buffer, { limitInputPixels: 80_000_000 }).metadata()).format);
  } catch {
    return false;
  }
}

function safePassthroughExtension(originalName: string) {
  const extension = path.extname(originalName).toLowerCase();
  return passthroughExtensions.has(extension) ? extension : '.bin';
}

function isVideoFile(originalName: string, mimeType?: string) {
  return videoMimeTypes.has(mimeType || '') || videoExtensions.has(path.extname(originalName).toLowerCase());
}

function videoDurationSeconds(inputPath: string) {
  if (!fs.existsSync(ffmpegPath)) throw new Error('视频处理工具不可用，请联系管理员');
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-i', inputPath], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });
  const match = result.stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!match) return undefined;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function transcodeVideo(inputPath: string, outputPath: string, duration?: number, retryScale = 1) {
  if (!fs.existsSync(ffmpegPath)) throw new Error('视频处理工具不可用，请联系管理员');
  const totalKbps = duration ? (targetVideoBytes * 8) / duration / 1000 : 1800;
  const videoKbps = Math.max(300, Math.min(2500, Math.floor((totalKbps - 112) * retryScale)));
  const result = spawnSync(ffmpegPath, [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-b:v',
    `${videoKbps}k`,
    '-maxrate',
    `${Math.ceil(videoKbps * 1.2)}k`,
    '-bufsize',
    `${videoKbps * 2}k`,
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-movflags',
    '+faststart',
    outputPath
  ], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.status !== 0 || !fs.existsSync(outputPath)) {
    throw new Error(`视频压缩失败：${(result.stderr || '未知错误').trim()}`);
  }
  return videoKbps;
}

async function saveOptimizedVideo(buffer: Buffer, originalName: string, basename: string, uploadsDir: string) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'h5-video-'));
  const inputExtension = videoExtensions.has(path.extname(originalName).toLowerCase())
    ? path.extname(originalName).toLowerCase()
    : '.mp4';
  const inputPath = path.join(tempDir, `input${inputExtension}`);
  const targetPath = path.join(uploadsDir, `${basename}.mp4`);
  try {
    await fs.promises.writeFile(inputPath, buffer);
    const duration = videoDurationSeconds(inputPath);
    const firstBitrate = transcodeVideo(inputPath, targetPath, duration);
    const outputSize = (await fs.promises.stat(targetPath)).size;
    if (outputSize > maximumVideoBytes) {
      const retryScale = Math.max(0.35, (targetVideoBytes / outputSize) * 0.92);
      await fs.promises.rm(targetPath, { force: true });
      transcodeVideo(inputPath, targetPath, duration, retryScale * (firstBitrate / Math.max(firstBitrate, 1)));
    }
    return {
      filename: path.basename(targetPath),
      path: targetPath,
      url: `/uploads/${path.basename(targetPath)}`,
      convertedToWebp: false
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

export async function saveProcessedFile(input: {
  buffer: Buffer;
  originalName: string;
  mimeType?: string;
  purpose?: UploadPurpose;
  uploadsDir: string;
  videoAlreadyMp4?: boolean;
}) {
  const basename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const purpose = input.purpose || 'media';
  await fs.promises.mkdir(input.uploadsDir, { recursive: true });

  const rasterFile = await isRasterFile(input.buffer, input.originalName, input.mimeType);
  if (purpose === 'cover' && !rasterFile) {
    throw new Error('作品首张海报必须是 JPG、PNG、WebP、AVIF、HEIC 或 TIFF 图片');
  }

  if (rasterFile) {
    const filename = `${basename}.webp`;
    const targetPath = path.join(input.uploadsDir, filename);
    const image = sharp(input.buffer, { animated: true, limitInputPixels: 80_000_000 }).rotate();
    const resized =
      purpose === 'cover'
        ? image.resize({ width: A3_COVER_WIDTH, height: A3_COVER_HEIGHT, fit: 'cover', position: 'attention' })
        : image.resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true });
    await resized.webp({ quality: 82, effort: 5, smartSubsample: true }).toFile(targetPath);
    return { filename, path: targetPath, url: `/uploads/${filename}`, convertedToWebp: true };
  }

  if (isVideoFile(input.originalName, input.mimeType)) {
    // 飞书 1080P 预览版已经是转码好的 H.264 MP4，直接落盘，跳过本地 ffmpeg 转码。
    if (input.videoAlreadyMp4) {
      const filename = `${basename}.mp4`;
      const targetPath = path.join(input.uploadsDir, filename);
      await fs.promises.writeFile(targetPath, input.buffer);
      return { filename, path: targetPath, url: `/uploads/${filename}`, convertedToWebp: false };
    }
    return saveOptimizedVideo(input.buffer, input.originalName, basename, input.uploadsDir);
  }

  const filename = `${basename}${safePassthroughExtension(input.originalName)}`;
  const targetPath = path.join(input.uploadsDir, filename);
  await fs.promises.writeFile(targetPath, input.buffer);
  return { filename, path: targetPath, url: `/uploads/${filename}`, convertedToWebp: false };
}
