import type { Work, WorkMedia } from './types';
import originalImages from './data/original-images.json';
import losslessImages from './data/lossless-images.json';
type OriginalImage = {url:string; width:number; height:number; bytes:number; displayUrl?:string};
// Image display does not need canvas CORS. Keep the stored URL unchanged for
// poster generation, while regular image elements use CDN delivery.
export function displayAsset(url:string):string {
  return /^\/assets\/[A-D]\d{2,3}-(cover|media)-/.test(url) ? `${url}?direct=1` : url;
}
export function originalImage(url:string): OriginalImage | undefined {
  const image=(originalImages as Record<string,OriginalImage>)[url];
  if(!image)return;
  const lossless=(losslessImages as Record<string,{url:string;bytes:number}>)[image.url];
  return {...image,displayUrl:lossless?.url || image.url};
}
export function orderedWorkMedia(work?:Work): WorkMedia[] {
  if(!work) return [];
  const media=[...work.media].sort((a,b)=>a.order-b.order);
  if(!work.cover) return media;
  const poster=media.find(m=>m.type==='image'&&m.url===work.cover);
  return [poster || {id:work.id+'_poster',type:'image',url:work.cover,title:'作品海报',order:0},...media.filter(m=>!(m.type==='image'&&m.url===work.cover))];
}
