# ERP-POS V5 Hybrid

V5 keeps the same web application and adds a Windows Electron shell plus a limited offline sales queue.

## What works offline
- Cached products/categories/branch stock remain visible after a successful online session.
- CASH sales for products without IMEI can be queued locally.
- The app reserves the sold quantity in the local cache on that device.
- A temporary OFFLINE receipt number is created and can be printed.
- When connectivity returns, queued sales are sent automatically.
- Every queued sale has a unique clientOperationId. The server stores it on the Invoice, so retries cannot create duplicate invoices.

## Intentionally online-only
IMEI sales, mixed/card/wallet/bank payments, loyalty/promotion redemption, returns, financial transfers, stock adjustments/transfers, and final closing remain online-only. These operations can create unsafe conflicts across branches/devices if accepted blindly while offline.

## Web development
Backend:
`cd backend && npm install && npx prisma generate && npx prisma db push && npm run dev`

Frontend:
`cd frontend && npm install && npm run dev`

## Windows development
From project root:
1. `npm install`
2. Run backend/frontend as usual in two terminals.
3. `npm run desktop:dev`

## Build Setup.exe for the cloud system
1. Deploy backend to Railway and confirm `/health` works.
2. Copy `frontend/.env.desktop.example` to `frontend/.env.production`.
3. Replace YOUR-RAILWAY-DOMAIN with the real public backend domain.
4. From project root run `npm install`.
5. Run `npm run desktop:build`.
6. Installer is generated in `release/`.

## Database update
V5 adds nullable unique `Invoice.clientOperationId` for idempotent offline synchronization. Run `npx prisma db push` from `backend` before using V5.

## Conflict behavior
If stock changed while a device was offline, the server rejects that queued sale instead of corrupting stock. It remains visible in Sync Center as FAILED for manager review.
