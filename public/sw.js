const CACHE='ilham-novandi-pwa-v63';
const APP_SHELL=[
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(APP_SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  const url=new URL(req.url);

  // Never cache API responses, POSTs, or WebSocket traffic.
  if(req.method!=='GET' || url.origin!==self.location.origin || url.pathname.startsWith('/api/')) return;

  // Navigation: network-first so a new deployment is picked up immediately,
  // with the cached shell as the offline fallback.
  if(req.mode==='navigate' || req.destination==='document'){
    event.respondWith(
      fetch(req,{cache:'no-store'})
        .then(res=>{
          const copy=res.clone();
          caches.open(CACHE).then(c=>c.put('/index.html',copy)).catch(()=>{});
          return res;
        })
        .catch(()=>caches.match('/index.html'))
    );
    return;
  }

  // Static app assets: cache-first, then update the cache in the background.
  event.respondWith(
    caches.match(req).then(cached=>{
      const refresh=fetch(req,{cache:'no-store'}).then(res=>{
        if(res && res.ok){
          const copy=res.clone();
          caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});
        }
        return res;
      }).catch(()=>cached);
      return cached || refresh;
    })
  );
});
