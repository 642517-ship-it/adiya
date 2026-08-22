/* الأدعية — خادم الإشعارات (Cloudflare Worker)
   يستيقظ كل خمس دقائق، يحسب مواعيد الصلاة لكل مشترك، ويدفع إشعارًا عند دخول الوقت.
   الإشعار بلا محتوى — النصّ يُبنى داخل جهاز المستخدم. */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function b64url(buf){
  const b = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return b.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function utf8(s){ return new TextEncoder().encode(s) }

/* ---------- توقيع VAPID ---------- */
async function vapidHeaders(env, endpoint){
  const aud = new URL(endpoint).origin;
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey('jwk', jwk,
    {name:'ECDSA', namedCurve:'P-256'}, false, ['sign']);
  const header  = b64url(utf8(JSON.stringify({typ:'JWT', alg:'ES256'})));
  const payload = b64url(utf8(JSON.stringify({
    aud, exp: Math.floor(Date.now()/1000) + 12*3600,
    sub: env.VAPID_SUBJECT || 'mailto:admin@example.com'
  })));
  const signed = header + '.' + payload;
  const sig = await crypto.subtle.sign({name:'ECDSA', hash:{name:'SHA-256'}}, key, utf8(signed));
  return {
    'Authorization': 'vapid t=' + signed + '.' + b64url(sig) + ', k=' + env.VAPID_PUBLIC_KEY,
    'TTL': '900', 'Urgency': 'normal', 'Content-Length': '0'
  };
}

async function pushTo(env, sub){
  try{
    const res = await fetch(sub.endpoint, {method:'POST', headers: await vapidHeaders(env, sub.endpoint)});
    if(res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'ok' : ('err ' + res.status);
  }catch(e){ return 'fail' }
}

/* ---------- حساب مواعيد الصلاة ---------- */
const DEG = Math.PI/180;
function jdOf(y,m,d){
  if(m<=2){y-=1;m+=12}
  const A=Math.floor(y/100), B=2-A+Math.floor(A/4);
  return Math.floor(365.25*(y+4716))+Math.floor(30.6001*(m+1))+d+B-1524.5;
}
function sunPos(jd){
  const D=jd-2451545.0, g=(357.529+0.98560028*D)%360, q=(280.459+0.98564736*D)%360,
        L=(q+1.915*Math.sin(g*DEG)+0.020*Math.sin(2*g*DEG))%360, e=23.439-0.00000036*D;
  let RA=Math.atan2(Math.cos(e*DEG)*Math.sin(L*DEG), Math.cos(L*DEG))/DEG/15;
  RA=(RA+24)%24;
  const decl=Math.asin(Math.sin(e*DEG)*Math.sin(L*DEG))/DEG;
  let EqT=q/15-RA; if(EqT>12)EqT-=24; if(EqT<-12)EqT+=24;
  return {d:decl, eq:EqT};
}
function hourAngle(lat,decl,ang){
  const c=(-Math.sin(ang*DEG)-Math.sin(lat*DEG)*Math.sin(decl*DEG))/(Math.cos(lat*DEG)*Math.cos(decl*DEG));
  return (c>1||c<-1) ? null : Math.acos(c)/DEG/15;
}
function prayerTimes(y,m,d,lat,lng,tz){
  const jd=jdOf(y,m,d)-lng/(15*24), s=sunPos(jd), dh=12+tz-lng/15-s.eq,
        sr=hourAngle(lat,s.d,0.833), fj=hourAngle(lat,s.d,18), ish=hourAngle(lat,s.d,17),
        asrA=-Math.atan(1/(1+Math.tan(Math.abs(lat-s.d)*DEG)))/DEG,
        ar=hourAngle(lat,s.d,asrA);
  const P={
    fajr: fj==null?4:dh-fj, sunrise: sr==null?6:dh-sr, dhuhr: dh,
    asr: ar==null?15:dh+ar, maghrib: sr==null?18:dh+sr, isha: ish==null?20:dh+ish
  };
  const night=(P.fajr+24)-P.maghrib;
  P.lastThird=P.maghrib+night*2/3;
  if(P.lastThird>=24)P.lastThird-=24;
  return P;
}

function dueEvent(P, t, prefs){
  const W = 5/60;
  const near = (v) => t >= v && t < v + W;
  if(prefs.prayers){
    for(const k of ['fajr','dhuhr','asr','maghrib','isha'])
      if(near(P[k])) return 'adhan-'+k;
  }
  if(prefs.morning && near(P.sunrise))   return 'morning';
  if(prefs.evening && near(P.asr))       return 'evening';
  if(prefs.sleep   && near(P.isha+0.5))  return 'sleep';
  if(prefs.tahajjud&& near(P.lastThird)) return 'tahajjud';
  return null;
}

function json(o, status){
  return new Response(JSON.stringify(o), {
    status: status||200,
    headers: {...CORS, 'Content-Type':'application/json; charset=utf-8'}
  });
}

async function handle(req, env){
  const url = new URL(req.url);
  if(req.method === 'OPTIONS') return new Response(null,{headers:CORS});

  if(url.pathname === '/vapid') return json({key: env.VAPID_PUBLIC_KEY});

  if(url.pathname === '/subscribe' && req.method === 'POST'){
    const b = await req.json();
    if(!b || !b.subscription || !b.subscription.endpoint) return json({error:'bad subscription'}, 400);
    const id = b64url(await crypto.subtle.digest('SHA-256', utf8(b.subscription.endpoint)));
    await env.SUBS.put('sub:'+id, JSON.stringify({
      endpoint: b.subscription.endpoint,
      lat: Number(b.lat), lng: Number(b.lng), tz: Number(b.tz),
      prefs: b.prefs || {}, saved: Date.now()
    }));
    return json({ok:true, id});
  }

  if(url.pathname === '/unsubscribe' && req.method === 'POST'){
    const b = await req.json();
    const id = b64url(await crypto.subtle.digest('SHA-256', utf8(b.endpoint)));
    await env.SUBS.delete('sub:'+id);
    await env.SUBS.delete('last:'+id);
    return json({ok:true});
  }

  if(url.pathname === '/test' && req.method === 'POST'){
    const b = await req.json();
    return json({result: await pushTo(env, {endpoint: b.endpoint})});
  }

  return json({error:'not found'}, 404);
}

async function tick(env){
  let cursor, sent=0, gone=0;
  do{
    const list = await env.SUBS.list({prefix:'sub:', cursor});
    cursor = list.list_complete ? null : list.cursor;
    for(const k of list.keys){
      const raw = await env.SUBS.get(k.name);
      if(!raw) continue;
      const s = JSON.parse(raw);
      if(!isFinite(s.lat) || !isFinite(s.lng)) continue;

      const d = new Date(Date.now() + (s.tz*3600*1000));
      const y=d.getUTCFullYear(), m=d.getUTCMonth()+1, dd=d.getUTCDate();
      const t = d.getUTCHours() + d.getUTCMinutes()/60;

      const P = prayerTimes(y,m,dd,s.lat,s.lng,s.tz);
      const ev = dueEvent(P, t, s.prefs||{});
      if(!ev) continue;

      const id = k.name.slice(4);
      const stamp = y+'-'+m+'-'+dd+':'+ev;
      if(await env.SUBS.get('last:'+id) === stamp) continue;

      const r = await pushTo(env, s);
      if(r === 'gone'){ await env.SUBS.delete(k.name); gone++; continue }
      if(r === 'ok'){
        await env.SUBS.put('last:'+id, stamp, {expirationTtl: 172800});
        sent++;
      }
    }
  }while(cursor);
  return {sent, gone};
}

export default {
  fetch: handle,
  scheduled: (event, env, ctx) => ctx.waitUntil(tick(env))
};
