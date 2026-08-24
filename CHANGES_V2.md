# ERP-POS v2 — أهم ما تم تحسينه

## Security & Access
- JWT secret validation in production.
- Login rate limiting.
- Socket.io JWT authentication.
- Server-side branch isolation using X-Branch-Id for SUPER_ADMIN only.
- Role restrictions on products, inventory adjustments, expenses and user management.
- Branch managers cannot create privileged roles.
- Demo passwords and committed .env removed.
- Change-password API added.

## POS & Inventory Integrity
- Serializable checkout transaction.
- Conditional stock decrement to reduce overselling under concurrency.
- Strong IMEI validation and duplicate detection.
- Cashier price override blocked server-side.
- Negative inventory prevented.
- IMEI-stock adjustments separated from generic stock adjustments.
- Completed/cancelled stock transfers cannot be executed again.
- Cashbox calculation corrected.

## Production & Railway
- Single-service deployment: Express serves frontend/dist.
- railway.json and nixpacks.toml included.
- Prisma migration command runs before deployment.
- Database-aware /health endpoint.
- Graceful shutdown and Prisma disconnect.
- Railway public domain automatically accepted by CORS when available.
- Environment template included.

## Frontend
- Removed exposed demo credentials.
- Real SUPER_ADMIN branch selection wired to backend requests.
- Branch changes clear branch-sensitive cart/cache state.
- Route-level role guards added.
- Branch API response compatibility fixed.

## Validation performed
- All backend JavaScript files passed `node --check` after changes.
- Full Vite/Prisma build could not be completed inside the review container because the uploaded ZIP contained Windows-native node_modules and the container had no reliable package-download access. Those node_modules were deliberately removed; Railway installs clean Linux dependencies via npm ci.
