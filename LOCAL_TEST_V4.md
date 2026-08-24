# تشغيل واختبار ERP-POS V4 محلياً على Windows

## 1) المتطلبات
- Node.js 20 LTS
- PostgreSQL/Supabase صالح

## 2) Backend
```powershell
cd backend
copy .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run dev
```

ضع `DATABASE_URL` الصحيح و`JWT_SECRET` قوي في `backend/.env`.
لإنشاء أول Admin في قاعدة جديدة:
```env
BOOTSTRAP_ADMIN=true
ADMIN_NAME=System Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ضع_كلمة_مرور_قوية
```
بعد نجاح أول تشغيل غيّر `BOOTSTRAP_ADMIN=false`.

## 3) Frontend
افتح Terminal ثانٍ:
```powershell
cd frontend
npm install
npm run dev
```
ثم افتح `http://localhost:5173`.

## 4) بعد تعديل Prisma Schema
```powershell
cd backend
npx prisma db push
npx prisma generate
```
اقرأ أي تحذير Data Loss قبل الموافقة، وخذ نسخة احتياطية من قاعدة بيانات إنتاجية قبل أي تغيير.

## 5) سيناريو اختبار مقترح
1. أنشئ فرعاً ومنتجات ومخزوناً.
2. من المالية تأكد من وجود خزنة/Vodafone/InstaPay/Bank.
3. افتح وردية ثم نفذ Cash sale.
4. نفذ Mixed Payment من وسيلتين.
5. نفذ Credit sale لعميل ثم حصّل جزءاً من المديونية.
6. أنشئ مورد وأمر شراء، استلم البضاعة، ثم سجّل دفعة ومرتجع مورد.
7. أنشئ جرداً، عدّل الكمية، Submit ثم Approve.
8. أنشئ Promotion واستخدم الكود في POS.
9. راجع Loyalty points للعميل وجرب التسوية والاستبدال.
10. سجل Trade-In ثم اعتمده إلى منتج مخزون مناسب.
11. أضف مصروفاً فوق حد الموافقة وتأكد أنه يذهب للموافقات.
12. نفذ مرتجع مبيعات وتأكد من المخزون والحساب المالي.
13. أغلق الوردية ثم نفذ Daily Closing.
14. راجع Reports وProfit & Loss.
15. من Tools صدّر CSV/Excel وخذ Backup JSON.

## ملاحظة
الـZIP النهائي لا يحتوي `node_modules` أو `.env`. هذا مقصود حتى يتم تثبيت مكتبات Windows/Linux الصحيحة على الجهاز أو Railway ولا يتم تسريب أسرار الاتصال.
