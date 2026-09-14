import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import ts from 'typescript';
import QRCode from 'qrcode';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage,GlobalFonts}=require('../../../node_modules/@napi-rs/canvas');
if(!GlobalFonts.registerFromPath('/System/Library/Fonts/STHeiti Medium.ttc','H5Sans')||!GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Songti.ttc','H5Serif'))throw Error('Chinese poster fonts unavailable');
const source=await fs.readFile('src/pages/DetailPage.vue','utf8');
const renderer=source.slice(source.indexOf('async function loadQrCode'),source.indexOf('\nonMounted(async')).replaceAll('"Kaiti SC", "KaiTi", serif','"H5Serif"').replaceAll('sans-serif','"H5Sans"');
const js=ts.transpileModule(renderer,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const title='北京市青年铸牢中华民族共同体意识文创设计大赛';
const titleLines=['北京市青年铸牢','中华民族共同体意识','文创设计大赛'];
const localImage=async url=>loadImage(url.startsWith('/assets/')?'data/real-import/processed/'+url.slice(8):url);
const generate=new Function('document','QRCode','loadImage','CONTEST_TITLE','CONTEST_TITLE_LINES',js+'\nreturn generatePoster;')({createElement:()=>createCanvas(750,1280)},QRCode,localImage,title,titleLines);
const response=await fetch('https://vote.wlbycuc.cn/api/works');if(!response.ok)throw Error('Public works unavailable');
const {works}=await response.json();if(!works.length||works.length>100)throw Error('Unexpected works scope');
const directory='data/share-posters';await fs.mkdir(directory,{recursive:true});const objects=[],mapping={};
for(const work of works){
  if(!/^[A-D]\d{2,3}$/.test(work.code))throw Error('Unexpected public work code');
  // A saved share image is not a live vote counter. Keep the source artwork,
  // title and author; the destination page shows current vote totals.
  const encoded=await generate({...work,votes:0},'https://vote.wlbycuc.cn/work/'+encodeURIComponent(work.id));
  const body=Buffer.from(encoded.split(',')[1],'base64'),sha256=createHash('sha256').update(body).digest('hex');
  const filename=`${work.code}-share-${sha256.slice(0,16)}.png`;
  await fs.writeFile(`${directory}/${filename}`,body);
  objects.push({filename,sha256,bytes:body.length,type:'image',mimeType:'image/png'});
  mapping[work.id]={url:'/assets/'+filename,code:work.code,title:work.title,author:work.author,cover:work.cover};
}
await fs.writeFile(`${directory}/manifest.json`,JSON.stringify({sourceRevision:'published-share-posters-20260908',objects},null,2));
await fs.writeFile('src/data/share-posters.json',JSON.stringify(mapping,null,2));
console.log(JSON.stringify({posters:objects.length,bytes:objects.reduce((n,x)=>n+x.bytes,0),sample:directory+'/'+objects[0].filename}));
