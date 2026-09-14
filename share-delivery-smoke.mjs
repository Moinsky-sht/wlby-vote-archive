import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base=process.argv[2]||'https://vote.wlbycuc.cn';
const {objects}=JSON.parse(await fs.readFile('data/share-posters/manifest.json','utf8'));
let cursor=0,verified=0;
await Promise.all(Array.from({length:3},async()=>{while(cursor<objects.length){
  const item=objects[cursor++];const response=await fetch(`${base}/assets/${item.filename}?download=1`,{signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200);assert.ok(response.headers.get('content-type')?.includes('image/png'));assert.ok(response.headers.get('content-disposition')?.includes('attachment'));
  const body=Buffer.from(await response.arrayBuffer());assert.equal(body.length,item.bytes);assert.equal(createHash('sha256').update(body).digest('hex'),item.sha256);verified++;
}}));
console.log(JSON.stringify({verifiedPosters:verified,downloadHeaders:true,byteExact:true}));
