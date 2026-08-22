/* الأدعية — service worker */
var VERSION='adiya-v6';
var SHELL=['./','./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];
var DATA=['./data/duas.json','./data/categories.json'];
var NET_TIMEOUT=2500;

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

function fromNet(req){
  return fetch(req).then(function(res){
    if(res&&res.ok){var c=res.clone();caches.open(VERSION).then(function(k){k.put(req,c)})}
    return res;
  });
}

function cacheFirst(req){
  return caches.match(req).then(function(hit){
    if(hit){fromNet(req).catch(function(){});return hit}
    return fromNet(req).catch(function(){return caches.match('./index.html')});
  });
}

/* الشبكة أوّلًا بمهلة: إن تأخّرت تُقدَّم النسخة المحفوظة فورًا */
function netFirstTimed(req){
  return caches.match(req).then(function(hit){
    if(!hit)return fromNet(req);
    return new Promise(function(resolve){
      var done=false;
      var timer=setTimeout(function(){if(!done){done=true;resolve(hit)}},NET_TIMEOUT);
      fromNet(req).then(function(res){
        if(!done){done=true;clearTimeout(timer);resolve(res)}
      }).catch(function(){
        if(!done){done=true;clearTimeout(timer);resolve(hit)}
      });
    });
  });
}

self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET')return;
  var url=new URL(req.url);
  if(url.origin!==location.origin)return;
  var isDoc=req.mode==='navigate'||/\/$|\.html$/.test(url.pathname);
  var isData=url.pathname.indexOf('/data/')>=0;
  if(isDoc||isData){e.respondWith(netFirstTimed(req));return}
  e.respondWith(cacheFirst(req));
});
