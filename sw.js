/* الأدعية — service worker */
var VERSION='adiya-v4';
var SHELL=['./','./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];
var DATA=['./data/duas.json','./data/categories.json'];

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){
    return c.addAll(SHELL.concat(DATA)).catch(function(){return c.addAll(SHELL)});
  }).then(function(){return self.skipWaiting()}));
});

self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){if(k!==VERSION)return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}));
});

function networkFirst(req){
  return fetch(req).then(function(res){
    if(res&&res.ok){var c=res.clone();caches.open(VERSION).then(function(k){k.put(req,c)})}
    return res;
  }).catch(function(){
    return caches.match(req).then(function(hit){return hit||caches.match('./index.html')});
  });
}

self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET')return;
  var url=new URL(req.url);
  if(url.origin!==location.origin)return;

  var isDoc=req.mode==='navigate'||/\/$|\.html$/.test(url.pathname);
  var isData=url.pathname.indexOf('/data/')>=0;

  /* الصفحة والبيانات: من الشبكة أوّلًا حتى لا تعلق نسخة قديمة */
  if(isDoc||isData){e.respondWith(networkFirst(req));return}

  /* الأيقونات: من الذاكرة أوّلًا */
  e.respondWith(caches.match(req).then(function(hit){
    return hit||fetch(req).then(function(res){
      if(res&&res.ok){var c=res.clone();caches.open(VERSION).then(function(k){k.put(req,c)})}
      return res;
    });
  }));
});
