import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base=process.argv[2]||'https://vote.wlbycuc.cn';
const originals=JSON.parse(await fs.readFile('data/real-import/originals-manifest.json','utf8')).objects;
const lossless=JSON.parse(await fs.readFile('data/real-import/lossless-manifest.json','utf8')).objects;
const previews=JSON.parse(await fs.readFile('data/real-import/manifest.json','utf8')).objects.filter(x=>x.type==='image');
let cursor=0,verified=0;const all=[...originals,...lossless];
await Promise.all(Array.from({length:3},async()=>{while(cursor<all.length){
  const item=all[cursor++];
  const first=await fetch(`${base}/assets/${item.filename}`,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(20000)});
  assert.equal(first.status,302);assert.equal(first.headers.get('cache-control'),'private, max-age=300');
  const target=first.headers.get('location');assert.ok(target.startsWith('https://'));
  const final=await fetch(target,{method:'HEAD',signal:AbortSignal.timeout(20000)});
  assert.equal(final.status,200);assert.equal(Number(final.headers.get('content-length')),item.bytes);
  assert.ok(!final.headers.get('content-disposition')?.includes('attachment'));
  verified++;
}}));
const sample=originals.find(x=>x.filename.startsWith('B37-media-1-'));
const timings=[];
for(const suffix of ['', '?download=1','']){
  const started=performance.now();const response=await fetch(`${base}/assets/${sample.filename}${suffix}`,{signal:AbortSignal.timeout(30000)});
  const firstMs=performance.now()-started,body=Buffer.from(await response.arrayBuffer());
  assert.equal(response.status,200);assert.equal(createHash('sha256').update(body).digest('hex'),sample.sha256);
  assert.equal(!!response.headers.get('content-disposition')?.includes('attachment'),suffix!== '');
  timings.push({mode:suffix?'download':'view',firstMs:Math.round(firstMs),totalMs:Math.round(performance.now()-started),bytes:body.length});
}
const range=await fetch(`${base}/assets/${sample.filename}?download=1`,{headers:{Range:'bytes=0-1023'}});
assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,1024);
const preview=previews[0];
const canvas=await fetch(`${base}/assets/${preview.filename}`,{method:'HEAD',redirect:'manual'});
assert.equal(canvas.status,200);
const direct=await fetch(`${base}/assets/${preview.filename}?direct=1`,{method:'HEAD',redirect:'manual'});
assert.equal(direct.status,302);
console.log(JSON.stringify({verified,originals:originals.length,lossless:lossless.length,byteExactOriginal:true,downloadHeader:true,rangeDownloads:true,canvasSameOrigin:true,previewDirectCdn:true,timings},null,2));
