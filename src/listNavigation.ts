// List DOM stays cached while viewing a work. Initial deep-link/back restoration
// waits for asynchronous list data rather than scrolling an empty loading page.
const ready = new Set<string>();
const waiters = new Map<string,Set<()=>void>>();
export function markListReady(path:string) {
  ready.add(path);
  waiters.get(path)?.forEach(resolve=>resolve());
  waiters.delete(path);
}
export function waitForListReady(path:string):Promise<void> {
  if(ready.has(path)) return Promise.resolve();
  return new Promise(resolve=>{
    const finish=()=>{clearTimeout(timer);waiters.get(path)?.delete(finish);resolve();};
    const timer=setTimeout(finish,15000);
    if(!waiters.has(path)) waiters.set(path,new Set());
    waiters.get(path)!.add(finish);
  });
}
