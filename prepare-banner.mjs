import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const input=process.argv[2];if(!input)throw new Error('Banner image required');
const directory='data/contest-banner';await fs.mkdir(directory,{recursive:true});
const objects=[],images=[];
for(const width of [960,1920]){
  const {data,info}=await sharp(input).rotate().resize({width,withoutEnlargement:true}).webp({lossless:true,effort:6}).toBuffer({resolveWithObject:true});
  const sha256=createHash('sha256').update(data).digest('hex');
  const filename=`contest-banner-${width}-${sha256.slice(0,16)}.webp`;
  await fs.writeFile(`${directory}/${filename}`,data);
  objects.push({filename,bytes:data.length,sha256,type:'image',mimeType:'image/webp'});
  images.push({url:'/assets/'+filename,width:info.width,height:info.height});
}
await fs.writeFile(`${directory}/manifest.json`,JSON.stringify({sourceRevision:'user-supplied-banner-20260908',objects},null,2));
await fs.writeFile('src/data/contest-banner.json',JSON.stringify(images,null,2));
console.log(JSON.stringify({images,bytes:objects.map(x=>x.bytes)}));
