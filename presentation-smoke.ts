import assert from 'node:assert/strict';
import fs from 'node:fs';
import { orderedWorkMedia, originalImage, displayAsset } from './src/workMedia';
import { CONTEST_TITLE, CONTEST_TITLE_LINES } from './src/contest';
import type { Work } from './src/types';
const works=JSON.parse(fs.readFileSync('data/real-import/works.json','utf8')) as Work[];
assert.equal(works.length,25);
let single=0,images=0;
for(const work of works){
  const media=orderedWorkMedia(work);
  assert.equal(media[0].type,'image');assert.equal(media[0].url,work.cover);
  assert.deepEqual(media.slice(1).map(m=>m.url),work.media.filter(m=>m.url!==work.cover).sort((a,b)=>a.order-b.order).map(m=>m.url));
  assert.equal(media.length,work.media.length);
  if(media.length===1)single++;
  for(const item of media.filter(m=>m.type==='image')){assert.ok(originalImage(item.url)?.url.includes('-original-'));images++;}
  assert.equal(orderedWorkMedia({...work,media:[]})[0].url,work.cover);
}
assert.equal(images,59);assert.ok(single>0);assert.equal(CONTEST_TITLE_LINES.join(''),CONTEST_TITLE);
assert.ok(!fs.readFileSync('src/pages/DetailPage.vue','utf8').includes('<dt>创作时间</dt>'));
const originals=JSON.parse(fs.readFileSync('data/real-import/originals-manifest.json','utf8')).objects;
const optimized=JSON.parse(fs.readFileSync('data/real-import/lossless-manifest.json','utf8')).objects;
const verification=JSON.parse(fs.readFileSync('data/real-import/lossless-verification.json','utf8'));
for(const image of optimized){
  const checked=verification.find((r:{optimizedFilename:string})=>r.optimizedFilename===image.filename);
  assert.ok(checked?.pixelExact&&checked?.iccExact);assert.ok(image.bytes<checked.originalBytes);
}
assert.equal(originals.length,59);
for(const work of works){
  assert.equal(displayAsset(work.cover),work.cover+'?direct=1');
  assert.ok(originalImage(work.cover)?.displayUrl);
}
assert.equal(displayAsset('/uploads/user-image.webp'),'/uploads/user-image.webp');
assert.equal(displayAsset('https://example.test/image.webp'),'https://example.test/image.webp');
assert.ok(fs.readFileSync('src/pages/DetailPage.vue','utf8').includes('loadImage(target.cover)'));
assert.ok(!fs.readFileSync('src/pages/DetailPage.vue','utf8').includes('loadImage(displayAsset('));
console.log(JSON.stringify({posterFirstWorks:works.length,singlePosterWorks:single,originalImages:images,fullContestTitle:true}));
