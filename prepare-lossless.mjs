import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
sharp.cache({memory:32});sharp.concurrency(2);
const root=path.resolve('data/real-import');
const input=JSON.parse(await fs.readFile(path.join(root,'originals-manifest.json'),'utf8'));
const out=path.join(root,'lossless');await fs.mkdir(out,{recursive:true});
const mapping={},objects=[],results=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const item of input.objects){
  const source=path.join(root,'originals',item.filename);
  const meta=await sharp(source).metadata();
  // Never convert CMYK, high bit depth, animation or oversized WebP canvases.
  if(meta.space!=='srgb'||meta.depth!=='uchar'||meta.width>16383||meta.height>16383||(meta.pages||1)>1){
    results.push({filename:item.filename,reason:'preserved-original-format'});continue;
  }
  const body=await sharp(source).keepMetadata().webp({lossless:true,effort:6}).toBuffer();
  if(body.length>=item.bytes*.95){results.push({filename:item.filename,reason:'no-meaningful-saving',originalBytes:item.bytes,candidateBytes:body.length});console.log(`${item.filename}: preserve original`);continue;}
  const converted=await sharp(body).metadata();
  // Compare actual samples with ICC conversion disabled, and keep the profile
  // and orientation unchanged. This is not a perceptual/lossy quality test.
  const before=await sharp(source,{ignoreIcc:true}).ensureAlpha().raw().toBuffer();
  const after=await sharp(body,{ignoreIcc:true}).ensureAlpha().raw().toBuffer();
  const identical=before.equals(after)&&meta.width===converted.width&&meta.height===converted.height&&
    (meta.orientation||1)===(converted.orientation||1)&&Buffer.from(meta.icc||[]).equals(Buffer.from(converted.icc||[]));
  if(!identical){results.push({filename:item.filename,reason:'pixel-or-profile-difference'});console.log(`${item.filename}: preserve original (verification)`);continue;}
  const digest=sha(body),filename=item.filename.replace(/original-[a-f0-9]{16}\.[a-z]+$/,`lossless-${digest.slice(0,16)}.webp`);
  await fs.writeFile(path.join(out,filename),body,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
  objects.push({filename,bytes:body.length,sha256:digest,type:'image',mimeType:'image/webp'});
  mapping['/assets/'+item.filename]={url:'/assets/'+filename,bytes:body.length};
  const result={filename:item.filename,optimizedFilename:filename,originalBytes:item.bytes,bytes:body.length,pixelExact:true,iccExact:true};results.push(result);
  console.log(JSON.stringify(result));
}
await fs.writeFile(path.join(root,'lossless-manifest.json'),JSON.stringify({sourceRevision:input.sourceRevision,objects},null,2));
await fs.writeFile(path.join(root,'lossless-verification.json'),JSON.stringify(results,null,2));
await fs.writeFile('src/data/lossless-images.json',JSON.stringify(mapping,null,2));
console.log(JSON.stringify({optimized:objects.length,total:input.objects.length,before:input.objects.reduce((n,x)=>n+x.bytes,0),after:input.objects.reduce((n,x)=>n+(mapping['/assets/'+x.filename]?.bytes||x.bytes),0)}));
