import {prisma} from './prisma.js';
import type {Prisma} from './generated/prisma/client.js';
const title='北京市青年铸牢中华民族共同体意识文创设计大赛';
const mode=process.argv[2];
if(!['--dry-run','--apply'].includes(mode))throw new Error('Explicit operation mode required');
try{
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT key FROM app_config WHERE key = 'config' FOR UPDATE`;
    const row=await tx.appConfig.findUnique({where:{key:'config'}});
    if(!row?.value||typeof row.value!=='object'||Array.isArray(row.value))throw new Error('Missing contest configuration');
    if(mode==='--apply')await tx.appConfig.update({where:{key:'config'},data:{value:{...(row.value as Record<string,Prisma.InputJsonValue>),title,shortTitle:title}}});
    console.log(JSON.stringify({mode,title,changedKeys:['title','shortTitle'],worksVotesAndSchedulePreserved:true}));
  });
}finally{await prisma.$disconnect();}
