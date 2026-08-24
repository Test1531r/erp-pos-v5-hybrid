# اختبار ERP-POS V3 محليًا على Windows

## 1) المتطلبات
- Node.js 20 LTS
- PostgreSQL أو Supabase PostgreSQL
- VS Code اختياري

## 2) إعداد Backend
افتح PowerShell داخل مجلد المشروع ثم:

```powershell
cd backend
copy .env.example .env
npm install
```

عدّل `.env` وضع DATABASE_URL و JWT_SECRET.
لإنشاء أول مدير فقط عند قاعدة بيانات جديدة:

```env
BOOTSTRAP_ADMIN=true
ADMIN_NAME="System Admin"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="ChangeThisPassword123!"
ADMIN_EMAIL="admin@local.test"
```

ثم:

```powershell
npx prisma generate
npx prisma db push
npm run dev
```

Backend الافتراضي: http://localhost:4000
Health: http://localhost:4000/health

بعد إنشاء أول Admin غيّر BOOTSTRAP_ADMIN إلى false.

## 3) إعداد Frontend
Terminal جديد:

```powershell
cd frontend
npm install
npm run dev
```

افتح العنوان الذي يظهر من Vite، غالبًا http://localhost:5173

## 4) سيناريو اختبار المالية
1. سجّل الدخول كمدير.
2. افتح "المالية والمحافظ".
3. ستُنشأ الحسابات الافتراضية تلقائيًا: خزنة، بطاقة، بنك، Vodafone Cash، InstaPay.
4. أضف محفظة أخرى إن أردت.
5. سجّل حركة داخلة على Vodafone.
6. سجّل حركة خارجة من Vodafone.
7. جرّب تحويل مبلغ من الخزنة إلى Vodafone.
8. راجع سجل الحركات والرصيد قبل/بعد.

## 5) اختبار الدفع المختلط
1. افتح نقطة البيع وأضف منتجات.
2. عند الدفع فعّل "دفع مختلط".
3. مثال فاتورة 1000: كاش 300 + Vodafone 400 + بطاقة 300.
4. أكمل البيع.
5. افتح المالية وتأكد أن كل حساب زاد بقيمته فقط.

## 6) اختبار المصروف
1. افتح المصروفات.
2. أضف مصروفًا واختر الحساب الذي تم الدفع منه.
3. افتح المالية وتأكد من ظهور EXPENSE وخفض الرصيد.

## 7) اختبار المرتجع
1. افتح المرتجعات.
2. ابحث برقم فاتورة.
3. اختر كمية مرتجعة وحساب رد المبلغ.
4. نفّذ المرتجع.
5. راجع المخزون، الحساب المالي، وسجل حركة المخزون.

## 8) اختبار الوردية
1. من المالية افتح وردية برصيد بداية.
2. نفذ مبيعات كاش.
3. أغلق الوردية واكتب النقد الفعلي.
4. النظام يحسب الرصيد المتوقع والعجز/الزيادة.

## 9) اختبار حركة المخزون
افتح "حركة المخزون" وراجع SALE / SALE_RETURN / TRANSFER / ADJUSTMENT.
