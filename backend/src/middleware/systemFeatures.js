import { prisma } from "../index.js";
import { authenticate } from "./auth.js";

const ROUTE_FEATURES = {
  "/api/pos": "pos", "/api/inventory": "inventory", "/api/products": "inventory",
  "/api/purchases": "purchases", "/api/receivables": "receivables", "/api/approvals": "approvals",
  "/api/growth": "growth", "/api/closing": "closing", "/api/stocktakes": "stocktake",
  "/api/reports": "reports", "/api/invoices": "sales", "/api/customers": "customers",
  "/api/repairs": "repairs", "/api/transfers": "transfers", "/api/expenses": "expenses",
  "/api/finance": "finance", "/api/returns": "returns", "/api/users": "users", "/api/branches": "branches"
};

export function enforceSystemFeature(feature) {
  return async (req, res, next) => {
    try {
      const auth = await new Promise(resolve => authenticate(req, {
        status: code => ({ json: body => resolve({ code, body }) })
      }, () => resolve(null)));
      if (auth) return res.status(auth.code).json(auth.body);
      const row = await prisma.systemSetting.findUnique({ where: { id: "global" }, select: { features: true } });
      const features = row?.features || {};
      if (features[feature] === false) return res.status(503).json({ error: "هذه الميزة معطلة حاليًا بواسطة مسؤول النظام", code: "FEATURE_DISABLED", feature });
      next();
    } catch {
      res.status(500).json({ error: "تعذر التحقق من إعدادات النظام" });
    }
  };
}
