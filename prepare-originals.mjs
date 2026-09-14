import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const root=path.resolve('data/real-import');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const rawFiles=fs.readdirSync(path.join(root,'raw'));
const target=path.join(root,'originals');
fs.mkdirSync(target,{recursive:true});
const objects=[],mapping={};
for(const item of manifest.objects.filter(x=>x.type==='image')) {
  const rawName=rawFiles.find(f=>f.startsWith(item.sourceToken+'.')&&!f.endsWith('.json'));
  if(!rawName) throw new Error('Missing original image');
  const raw=path.join(root,'raw',rawName),body=fs.readFileSync(raw);
  const meta=await sharp(body,{limitInputPixels:180000000}).metadata();
  const extension=meta.format==='jpeg'?'jpg':meta.format;
  if(!['jpg','png','webp','gif','avif'].includes(extension)) throw new Error('Unsupported original image format');
  const sha256=crypto.createHash('sha256').update(body).digest('hex');
  const filename=item.filename.replace(/-[a-f0-9]{16}\.webp$/,`-original-${sha256.slice(0,16)}.${extension}`);
  const link=path.join(target,filename);
  if(!fs.existsSync(link)) fs.symlinkSync(raw,link);
  const mimeType=extension==='jpg'?'image/jpeg':`image/${extension}`;
  objects.push({filename,bytes:body.length,sha256,type:'image',mimeType});
  const rotated=[5,6,7,8].includes(meta.orientation);
  mapping['/assets/'+item.filename]={url:'/assets/'+filename,width:rotated?meta.height:meta.width,height:rotated?meta.width:meta.height,bytes:body.length};
}
console.log(JSON.stringify({manifest:{sourceRevision:manifest.sourceRevision,objects},mapping}));
