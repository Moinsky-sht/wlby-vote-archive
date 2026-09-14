type ShareWork={id:string;code:string;title:string;description:string;cover:string};
const contest='北京市青年铸牢中华民族共同体意识文创设计大赛';
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export const shareImagePath='/share/contest-main-20260909.jpg';
function shareHtml(template:string,title:string,description:string,url:string,origin:string):string {
  // Stable small JPEG: no cookies, expiring signatures, or format negotiation.
  const image=new URL(shareImagePath,origin).href;
  const metadata=[['og:type','website'],['og:locale','zh_CN'],['og:site_name',contest],['og:title',title],['og:description',description],['og:url',url],['og:image',image],['og:image:secure_url',image],['og:image:type','image/jpeg'],['og:image:width','400'],['og:image:height','400'],['og:image:alt',contest]].map(([key,value])=>`<meta property="${key}" content="${escapeHtml(value)}" />`).join('\n');
  const tags=`${metadata}\n<meta name="description" content="${escapeHtml(description)}" />\n<meta name="twitter:card" content="summary" />\n<meta name="twitter:title" content="${escapeHtml(title)}" />\n<meta name="twitter:description" content="${escapeHtml(description)}" />\n<meta name="twitter:image" content="${escapeHtml(image)}" />\n<meta itemprop="image" content="${escapeHtml(image)}" />\n<link rel="image_src" href="${escapeHtml(image)}" />\n<link rel="icon" type="image/jpeg" href="${escapeHtml(image)}" />\n<link rel="apple-touch-icon" href="${escapeHtml(image)}" />\n<link rel="canonical" href="${escapeHtml(url)}" />`;
  return template.replace(/<title>[^]*?<\/title>/i,()=>`<title>${escapeHtml(title)}</title>`).replace('</head>',()=>`${tags}\n</head>`);
}
export function siteShareHtml(template:string,path:string,origin:string):string {
  const url=new URL(path==='/'?'/vote':path,origin).href;
  return shareHtml(template,contest,'铸牢共同体 文创赋新篇——中华优秀传统文化与现代创意融合实践。浏览参赛作品，为你喜爱的作品投票。',url,origin);
}
export function workShareHtml(template:string,work:ShareWork,origin:string):string {
  const url=new URL('/work/'+encodeURIComponent(work.id),origin).href;
  const title=`${work.code} ${work.title}｜${contest}`;
  const description=(work.description||`为参赛作品《${work.title}》投票`).slice(0,180);
  return shareHtml(template,title,description,url,origin);
}
