# نشر خادم الإشعارات

## 1. توليد مفتاحَي VAPID

```
npx --yes web-push generate-vapid-keys --json
```

احتفظ بالمخرجات. المفتاح العامّ يوضع في الإعدادات، والخاصّ يوضع سرًّا ولا يُشارك مع أحد.

## 2. تحويل المفتاح الخاصّ إلى صيغة JWK

```
node -e "const k=process.argv[1];const b=Buffer.from(k.replace(/-/g,'+').replace(/_/g,'/'),'base64');console.log(JSON.stringify({kty:'EC',crv:'P-256',d:k,x:'',y:''}))" PRIVATE_KEY
```

الأسهل: استعمل الأمر الجاهز في المحادثة.

## 3. إنشاء مساحة KV

```
npx wrangler kv namespace create SUBS
```

انسخ الـ id إلى `wrangler.toml`.

## 4. وضع المفتاح الخاصّ سرًّا

```
npx wrangler secret put VAPID_PRIVATE_JWK
```

## 5. النشر

```
npx wrangler deploy
```

سيعطيك عنوانًا مثل `https://adiya-push.<اسمك>.workers.dev` — ضعه في `PUSH_URL` داخل `index.html`.
