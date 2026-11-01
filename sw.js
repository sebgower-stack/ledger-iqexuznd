const VERSION="2026-11-02T11:21:21";const CACHE="ledger-"+VERSION;const SHELL=['./','index.html','app.js','app.css','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;
 if(u.pathname.endsWith('sw.js')){e.respondWith(fetch(r,{cache:'no-store'}));return;}
 const key=r.mode==='navigate'?'index.html':r;
 e.respondWith(fetch(r.mode==='navigate'?r.url:r,{cache:'no-store'}).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(key,cp));}return res;}).catch(()=>caches.match(key,{ignoreSearch:true})));});
