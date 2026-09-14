export type LinkShareData={url:string;title:string;text:string};
export const isWechatBrowser=()=>/micromessenger/i.test(navigator.userAgent);
function legacyCopy(text:string):boolean {
  const field=document.createElement('textarea');
  const previous=document.activeElement as HTMLElement|null;
  field.value=text;field.setAttribute('readonly','');field.style.cssText='position:fixed;left:0;top:0;opacity:0;pointer-events:none';
  (document.querySelector('dialog[open]')||document.body).appendChild(field);
  try{field.focus();field.select();return document.execCommand('copy');}
  catch{return false;}
  finally{field.remove();previous?.focus({preventScroll:true});}
}
export async function copyShareLink(text:string,clipboard:Pick<Clipboard,'writeText'>|undefined=navigator.clipboard,fallback=legacyCopy):Promise<boolean>{
  try{if(clipboard){await clipboard.writeText(text);return true;}}catch{/* Older/embedded browsers may deny Clipboard API. */}
  return fallback(text);
}
export function shareCancelled(error:unknown):boolean{return typeof error==='object'&&error!==null&&'name' in error&&error.name==='AbortError';}
