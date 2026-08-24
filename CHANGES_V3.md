# ERP-POS V3 — Finance & Operations

## New finance engine
- Branch-level financial accounts with independent balances.
- Default accounts: Cashbox, Card, Bank, Vodafone Cash, InstaPay.
- Custom wallets/accounts can be created without code changes.
- Immutable-style financial transaction ledger with before/after balances.
- Manual IN / OUT transactions with reason and notes.
- Account-to-account transfers using paired OUT/IN entries linked by one transfer group.
- Negative balance protection by default.

## POS payments
- Every sale posts money to the selected financial account.
- True split payments: one invoice can be paid using multiple payment methods/accounts.
- Cash change is handled without inflating account balance.
- Payment splits are stored against the invoice.

## Expenses
- Expense can be paid from any financial account.
- Account balance is reduced atomically with expense creation.
- Expense is linked to its financial transaction for auditability.

## Returns
- Partial or full sales returns.
- Return quantity cannot exceed remaining returnable quantity.
- IMEI return validation and restoration to IN_STOCK.
- Inventory is restored automatically.
- Refund posts OUT from the selected financial account.
- Customer total spending is adjusted.
- Return numbers and return history are stored.

## Cashier shifts
- Open and close shifts.
- Opening cash balance.
- Expected cash based on the cashier's movements during the shift.
- Actual closing balance and variance (shortage/overage).
- Shift history for managers/accountants.

## Stock ledger
- Stock movements are recorded for sales, sales returns, adjustments, IMEI receiving and branch transfers.
- Quantity before/after every movement.
- User, reference and notes stored for traceability.

## UI
- New Finance & Wallets screen.
- Account cards and daily IN/OUT/net KPIs.
- Financial transaction ledger.
- Wallet/account creation.
- Internal money transfer UI.
- Shift open/close UI.
- New Returns screen.
- New Stock Movement Ledger screen.
- Mixed payment interface inside POS.
- Expense source-account selector.

## Deployment
- Version bumped to V3.
- Railway pre-deploy uses `prisma db push --skip-generate` because this project did not contain a complete historical Prisma migration chain.
- `node_modules` is intentionally excluded; install dependencies fresh on the target OS.
