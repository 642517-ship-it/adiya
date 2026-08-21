/* الأدعية — service worker */
var VERSION='adiya-v3';
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
self.addEventListener('fetch',function(e){
  var req=e.request;if(req.method!=='GET')return;
  var url=new URL(req.url);if(url.origin!==location.origin)return;
  if(url.pathname.indexOf('/data/')>=0){
    e.respondWith(fetch(req).then(function(res){
      var c=res.clone();caches.open(VERSION).then(function(k){k.put(req,c)});return res;
    }).catch(function(){return caches.match(req)}));
    return;
  }
  e.respondWith(caches.match(req).then(function(hit){
    var net=fetch(req).then(function(res){
      var c=res.clone();caches.open(VERSION).then(function(k){k.put(req,c)});return res;
    }).catch(function(){return hit});
    return hit||net;
  }));
});
