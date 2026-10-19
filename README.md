# Alashry | العشري — ERP/POS V5 Hybrid

نسخة V4 تشمل المالية والمحافظ، POS، المشتريات، الآجل والأقساط، الجرد، الموافقات، العروض والولاء، Trade-In، التقارير والأدوات. راجع `CHANGES_V4.md` و`LOCAL_TEST_V4.md`.

# ERP-POS V3

نظام نقاط بيع وإدارة فروع ومخزون وIMEI ومالية ومحافظ ومرتجعات وورديات.

راجع `LOCAL_TEST_V3.md` للتشغيل والاختبار المحلي، و`CHANGES_V3.md` للتغييرات الجديدة.

# ERP-POS v2 — Production Edition

نظام ERP/POS متعدد الفروع لمتاجر الموبايل والإلكترونيات، مبني بـ React + Vite وExpress + Prisma + PostgreSQL.

## أهم التحسينات في v2

- صلاحيات Backend وFrontend حسب الدور، مع عزل الفرع لغير الـSuper Admin.
- اختيار فرع حقيقي للـSuper Admin عبر `X-Branch-Id` بدل تغيير شكلي في الواجهة.
- Socket.io محمي بـJWT، ولا يمكن لمستخدم الانضمام لغرفة فرع غير مصرح له.
- Checkout داخل Serializable Transaction مع حماية من تغيّر المخزون أثناء البيع.
- تحقق أقوى من IMEI: المنتج، الفرع، الحالة، العدد، والتكرار.
- منع الكاشير من تعديل سعر المنتج من الـClient بدون صلاحية.
- منع المخزون السالب وتسويات IMEI غير المتسقة.
- منع تنفيذ تحويل مخزون مغلق أكثر من مرة.
- Audit log للعمليات الحساسة وتغيير كلمة المرور.
- إلغاء المستخدمين وكلمات المرور التجريبية من الكود والواجهة.
- Health check حقيقي لقاعدة البيانات + graceful shutdown.
- تشغيل Frontend وBackend كخدمة Railway واحدة.
- ملفات Railway/Nixpacks جاهزة ونشر migrations قبل التشغيل.

## تشغيل محلي

1. انسخ `backend/.env.example` إلى `backend/.env` وعدل القيم.
2. ثبّت الاعتمادات:

```bash
npm ci --prefix backend
npm ci --prefix frontend
```

3. جهّز Prisma وقاعدة البيانات:

```bash
npm run db:generate --prefix backend
npm run db:migrate --prefix backend
```

4. للتطوير شغل كل جزء في Terminal منفصل:

```bash
npm run dev --prefix backend
npm run dev --prefix frontend
```

## إنشاء أول Admin

لا توجد كلمات مرور افتراضية. لأول تشغيل فقط ضع في Environment:

```env
BOOTSTRAP_ADMIN=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ضع-كلمة-مرور-قوية-10-أحرف-على-الأقل
ADMIN_NAME=System Admin
DEFAULT_BRANCH_NAME=الفرع الرئيسي
DEFAULT_BRANCH_CODE=MAIN
```

بعد نجاح أول تشغيل، احذف `BOOTSTRAP_ADMIN` أو اجعله `false`.

## Railway

ارفع جذر المشروع إلى GitHub ثم اربطه بـRailway. المشروع يحتوي `railway.json` و`nixpacks.toml`، لذلك Railway سيقوم بتثبيت Backend/Frontend، بناء React، تشغيل Prisma migrations، ثم تشغيل Express الذي يخدم الـAPI والواجهة معاً.

Environment Variables الأساسية:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=قيمة-عشوائية-طويلة-32-حرف-على-الأقل
NODE_ENV=production
FRONTEND_URL=https://YOUR-DOMAIN
```

Railway يضيف `PORT` تلقائياً. ويمكن استخدام `RAILWAY_PUBLIC_DOMAIN` تلقائياً ضمن CORS.

## فحص الصحة

```text
GET /health
```

الحالة السليمة ترجع `status: ok` و`database: connected`.

## ملاحظات أمان

- لا ترفع `backend/.env` إلى GitHub.
- لا تستخدم `prisma db push` على Production؛ استخدم migrations.
- اجعل `JWT_SECRET` عشوائياً وطويلاً.
- مدير الفرع لا يستطيع إنشاء/منح دور Super Admin أو Branch Manager.
- كل عمليات البيع والمخزون الحرجة يعاد التحقق منها في السيرفر؛ لا يتم الوثوق بقيم الواجهة وحدها.

## Alashry V5 Hybrid (Web + Windows + limited Offline)
See `V5_HYBRID_GUIDE.md` for Windows desktop build, cloud API configuration, offline-sale rules, and synchronization behavior.
