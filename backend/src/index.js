import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server as SocketIO } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import authRoutes from "./routes/auth.js";
import branchRoutes from "./routes/branches.js";
import userRoutes from "./routes/users.js";
import categoryRoutes from "./routes/categories.js";
import productRoutes from "./routes/products.js";
import inventoryRoutes from "./routes/inventory.js";
import posRoutes from "./routes/pos.js";
import invoiceRoutes from "./routes/invoices.js";
import customerRoutes from "./routes/customers.js";
import supplierRoutes from "./routes/suppliers.js";
import repairRoutes from "./routes/repairs.js";
import transferRoutes from "./routes/transfers.js";
import expenseRoutes from "./routes/expenses.js";
import reportRoutes from "./routes/reports.js";
import auditRoutes from "./routes/audit.js";
import financeRoutes from "./routes/finance.js";
import returnRoutes from "./routes/returns.js";
import purchaseRoutes from "./routes/purchases.js";
import receivableRoutes from "./routes/receivables.js";
import approvalRoutes from "./routes/approvals.js";
import growthRoutes from "./routes/growth.js";
import closingRoutes from "./routes/closing.js";
import stocktakeRoutes from "./routes/stocktakes.js";
import settingsRoutes from "./routes/settings.js";
import { enforceSystemFeature } from "./middleware/systemFeatures.js";

function requireEnv(name, minLength = 1) {
  const value = process.env[name];
  if (!value || value.length < minLength) throw new Error(`Missing or invalid environment variable: ${name}`);
  return value;
}

requireEnv("DATABASE_URL");
requireEnv("JWT_SECRET", process.env.NODE_ENV === "production" ? 32 : 8);

export const prisma = new PrismaClient();
const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

const configuredOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",").map((v) => v.trim()).filter(Boolean);
const railwayOrigin = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null;
const allowedOrigins = [...new Set([...configuredOrigins, railwayOrigin].filter(Boolean))];
const corsOptions = {
  origin(origin, cb) {
    if (!origin || origin === "null" || origin.startsWith("file://") || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("CORS origin not allowed"));
  },
  credentials: true,
};

export const io = new SocketIO(httpServer, { cors: { ...corsOptions, methods: ["GET", "POST"] } });

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("unauthorized"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, role: true, branchId: true, isActive: true } });
    if (!user?.isActive) return next(new Error("unauthorized"));
    socket.user = user;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  if (socket.user.branchId) socket.join(`branch:${socket.user.branchId}`);
  socket.on("join:branch", async (branchId) => {
    if (!branchId) return;
    if (socket.user.role !== "SUPER_ADMIN" && socket.user.branchId !== branchId) return;
    socket.join(`branch:${branchId}`);
  });
});

app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false }));
app.use(cors(corsOptions));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1200, standardHeaders: true, legacyHeaders: false }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, skipSuccessfulRequests: true, message: { error: "محاولات دخول كثيرة، حاول لاحقاً" } });
app.use("/api/auth/login", loginLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/branches", enforceSystemFeature("branches"), branchRoutes);
app.use("/api/users", enforceSystemFeature("users"), userRoutes);
app.use("/api/categories", enforceSystemFeature("inventory"), categoryRoutes);
app.use("/api/products/bulk/import", enforceSystemFeature("tools"));
app.use("/api/products", enforceSystemFeature("inventory"), productRoutes);
app.use("/api/inventory/movements", enforceSystemFeature("stockLedger"));
app.use("/api/inventory", enforceSystemFeature("inventory"), inventoryRoutes);
app.use("/api/pos", enforceSystemFeature("pos"), posRoutes);
app.use("/api/invoices", enforceSystemFeature("sales"), invoiceRoutes);
app.use("/api/customers", enforceSystemFeature("customers"), customerRoutes);
app.use("/api/suppliers", enforceSystemFeature("purchases"), supplierRoutes);
app.use("/api/repairs", enforceSystemFeature("repairs"), repairRoutes);
app.use("/api/transfers", enforceSystemFeature("transfers"), transferRoutes);
app.use("/api/expenses", enforceSystemFeature("expenses"), expenseRoutes);
app.use("/api/reports", enforceSystemFeature("reports"), reportRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/finance", enforceSystemFeature("finance"), financeRoutes);
app.use("/api/returns", enforceSystemFeature("returns"), returnRoutes);
app.use("/api/purchases", enforceSystemFeature("purchases"), purchaseRoutes);
app.use("/api/receivables", enforceSystemFeature("receivables"), receivableRoutes);
app.use("/api/approvals", enforceSystemFeature("approvals"), approvalRoutes);
app.use("/api/growth", enforceSystemFeature("growth"), growthRoutes);
app.use("/api/closing", enforceSystemFeature("closing"), closingRoutes);
app.use("/api/stocktakes", enforceSystemFeature("stocktake"), stocktakeRoutes);
app.use("/api/settings", settingsRoutes);

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected", version: "5.0.0", time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "degraded", database: "unavailable", time: new Date().toISOString() });
  }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  // Keep the SPA entry point fresh so browsers don't keep serving an old build
  // after Railway deploys a new frontend. Vite's hashed assets remain cacheable.
  app.use(express.static(frontendDist, {
    maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
    setHeaders(res, filePath) {
      if (path.basename(filePath) === "index.html") {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  }));
  app.get(/^\/(?!api|health|socket\.io).*/, (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((req, res) => {
  const english = String(req.headers["accept-language"] || "").toLowerCase().startsWith("en");
  res.status(404).json({ error: english ? "Route not found." : "المسار غير موجود" });
});
app.use((err, req, res, next) => {
  console.error("[Unhandled]", err);
  const english = String(req.headers["accept-language"] || "").toLowerCase().startsWith("en");
  if (err.message === "CORS origin not allowed") return res.status(403).json({ error: english ? "Origin is not allowed." : "Origin غير مسموح" });
  res.status(500).json({ error: english ? "An unexpected internal error occurred." : "حدث خطأ داخلي غير متوقع" });
});

async function bootstrapAdmin() {
  if (process.env.BOOTSTRAP_ADMIN !== "true") return;
  const existing = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (existing) return;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password || password.length < 10) throw new Error("BOOTSTRAP_ADMIN requires ADMIN_USERNAME and ADMIN_PASSWORD (10+ chars)");
  let branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if (!branch) branch = await prisma.branch.create({ data: { name: process.env.DEFAULT_BRANCH_NAME || "الفرع الرئيسي", code: process.env.DEFAULT_BRANCH_CODE || "MAIN" } });
  await prisma.user.create({ data: { name: process.env.ADMIN_NAME || "System Admin", username, email: process.env.ADMIN_EMAIL || null, passwordHash: await bcrypt.hash(password, 12), role: "SUPER_ADMIN", branchId: branch.id } });
  console.log("[Bootstrap] Initial admin created. Disable BOOTSTRAP_ADMIN after first deployment.");
}

const PORT = Number(process.env.PORT || 4000);
httpServer.listen(PORT, async () => {
  try {
    await prisma.$connect();
    await bootstrapAdmin();
    console.log(`ERP-POS v5 listening on port ${PORT}`);
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
});

async function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  io.close();
  httpServer.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
