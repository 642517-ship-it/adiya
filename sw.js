/* الأدعية — service worker */
var VERSION='adiya-v8';
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

/* ================= الإشعارات ================= */
var DEG=Math.PI/180;
function jdOf(y,m,d){if(m<=2){y-=1;m+=12}var A=Math.floor(y/100),B=2-A+Math.floor(A/4);
  return Math.floor(365.25*(y+4716))+Math.floor(30.6001*(m+1))+d+B-1524.5}
function sunPos(jd){
  var D=jd-2451545.0,g=(357.529+0.98560028*D)%360,q=(280.459+0.98564736*D)%360,
      L=(q+1.915*Math.sin(g*DEG)+0.020*Math.sin(2*g*DEG))%360,e=23.439-0.00000036*D,
      RA=Math.atan2(Math.cos(e*DEG)*Math.sin(L*DEG),Math.cos(L*DEG))/DEG/15,
      decl=Math.asin(Math.sin(e*DEG)*Math.sin(L*DEG))/DEG;
  RA=(RA+24)%24;var EqT=q/15-RA;if(EqT>12)EqT-=24;if(EqT<-12)EqT+=24;
  return {d:decl,eq:EqT};
}
function hourAngle(lat,decl,ang){
  var c=(-Math.sin(ang*DEG)-Math.sin(lat*DEG)*Math.sin(decl*DEG))/(Math.cos(lat*DEG)*Math.cos(decl*DEG));
  return (c>1||c<-1)?null:Math.acos(c)/DEG/15;
}
function prayerTimes(date,lat,lng){
  var tz=-date.getTimezoneOffset()/60,
      jd=jdOf(date.getFullYear(),date.getMonth()+1,date.getDate())-lng/(15*24),
      s=sunPos(jd),dh=12+tz-lng/15-s.eq,
      sr=hourAngle(lat,s.d,0.833),fj=hourAngle(lat,s.d,18),ish=hourAngle(lat,s.d,17),
      asrA=-Math.atan(1/(1+Math.tan(Math.abs(lat-s.d)*DEG)))/DEG,
      ar=hourAngle(lat,s.d,asrA);
  var P={fajr:fj==null?4:dh-fj,sunrise:sr==null?6:dh-sr,dhuhr:dh,
         asr:ar==null?15:dh+ar,maghrib:sr==null?18:dh+sr,isha:ish==null?20:dh+ish};
  var night=(P.fajr+24)-P.maghrib;
  P.lastThird=P.maghrib+night*2/3;
  if(P.lastThird>=24)P.lastThird-=24;
  return P;
}
var PNAME={fajr:'الفجر',dhuhr:'الظهر',asr:'العصر',maghrib:'المغرب',isha:'العشاء'};

function getLoc(){
  return caches.open('adiya-conf').then(function(c){return c.match('conf/loc')})
    .then(function(r){return r?r.json():null}).catch(function(){return null});
}

/* نصّ الإشعار يُبنى هنا داخل الجهاز — لا يأتي من الخادم */
function buildNotice(){
  return getLoc().then(function(loc){
    if(!loc)loc={lat:31.7683,lng:35.2137};
    var now=new Date(),t=now.getHours()+now.getMinutes()/60,
        p=prayerTimes(now,loc.lat,loc.lng),W=8/60;
    function near(v){return t>=v-W&&t<v+W}
    for(var k in PNAME)
      if(near(p[k]))return {title:'حان وقت '+PNAME[k],body:'أذكار الأذان وما بعد الصلاة'};
    if(near(p.sunrise))   return {title:'أذكار الصباح',body:'خمسة أذكار في انتظارك'};
    if(near(p.asr))       return {title:'أذكار المساء',body:'خمسة أذكار في انتظارك'};
    if(near(p.isha+0.5))  return {title:'أذكار النوم',body:'اختم يومك بذكر الله'};
    if(near(p.lastThird)) return {title:'الثلث الأخير من الليل',body:'وقت النزول الإلهي وساعة الإجابة'};
    return {title:'الأدعية',body:'حان وقت الذكر'};
  });
}

self.addEventListener('push',function(e){
  e.waitUntil(buildNotice().then(function(n){
    return self.registration.showNotification(n.title,{
      body:n.body,icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',
      lang:'ar',dir:'rtl',tag:'adiya-time',renotify:true,data:{url:'./'}
    });
  }));
});

self.addEventListener('notificationclick',function(e){
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){
      if(list[i].url.indexOf('/adiya')>=0&&'focus' in list[i])return list[i].focus();
    }
    if(clients.openWindow)return clients.openWindow('./');
  }));
});
