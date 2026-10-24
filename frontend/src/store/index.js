import axios from "axios";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { io } from "socket.io-client";
import toast from "react-hot-toast";

// ─── API CLIENT ───────────────────────────────
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api", timeout: 15000 });

api.interceptors.request.use((config) => {
  const state = useStore.getState();
  if (state.token) config.headers.Authorization = `Bearer ${state.token}`;
  config.headers["Accept-Language"] = state.language === "en" ? "en" : "ar";
  if (state.activeBranch?.id) config.headers["X-Branch-Id"] = state.activeBranch.id;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      useStore.getState().logout();
    }
    return Promise.reject(err);
  }
);

// ─── SOCKET ──────────────────────────────────
let socket = null;
function initSocket(token, branchId) {
  if (socket?.connected) return socket;
  const socketUrl = import.meta.env.VITE_SOCKET_URL || (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "") : undefined);
  socket = io(socketUrl, { auth: { token }, transports: ["websocket"] });
  if (branchId) socket.emit("join:branch", branchId);
  return socket;
}

// ─── STORE ───────────────────────────────────
export const useStore = create(
  persist(
    (set, get) => ({
      // Auth
      user: null,
      token: null,
      isAuthenticated: false,
      socket: null,

      // Branch
      activeBranch: null,
      branches: [],

      // POS Cart
      cartItems: [],
      cartCustomer: null,
      cartDiscount: 0,
      cartTaxRate: 0,
      cartNotes: "",
      checkoutLoading: false,
      lastInvoice: null,

      // Data
      products: [],
      categories: [],
      customers: [],
      inventoryMap: {},
      lowStockItems: [],
      dashboard: null,
      searchQuery: "",
      selectedCategory: null,

      // Hybrid / Offline
      isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
      offlineQueue: [],
      lastSyncAt: null,
      syncInProgress: false,

      // UI
      activeModule: "dashboard",
      sidebarOpen: true,
      language: "ar",
      systemFeatures: {},
      setSystemFeatures: (systemFeatures) => set({ systemFeatures: systemFeatures || {} }),
      setLanguage: (language) => set({ language: language === "en" ? "en" : "ar" }),

      // ── AUTH ──────────────────────────────
      login: async (username, password, branchId) => {
        try {
          const { data } = await api.post("/auth/login", { username, password, branchId });
          const sock = initSocket(data.token, data.user.branchId);
          sock.on("inventory:update", ({ productId, branchId, quantity }) => {
            set((s) => ({
              inventoryMap: { ...s.inventoryMap, [`${productId}_${branchId}`]: quantity },
              products: s.products.map((p) => p.id !== productId ? p : {
                ...p, inventory: (p.inventory || []).map((inv) => inv.branchId === branchId ? { ...inv, quantity } : inv),
              }),
            }));
          });
          set({ user: data.user, token: data.token, isAuthenticated: true, activeBranch: data.user.branch || null, socket: sock });
          toast.success(`أهلاً ${data.user.name}!`);
          return { success: true };
        } catch (err) {
          const msg = err.response?.data?.error || "فشل تسجيل الدخول";
          toast.error(msg);
          return { success: false, error: msg };
        }
      },

      logout: () => {
        socket?.disconnect();
        socket = null;
        set({ user: null, token: null, isAuthenticated: false, activeBranch: null, cartItems: [], socket: null });
      },

      // ── BRANCH ────────────────────────────
      fetchBranches: async () => {
        try {
          const { data } = await api.get("/branches?limit=100");
          const list = Array.isArray(data) ? data : (data.data || []);
          set({ branches: list });
          if (!get().activeBranch && list[0]) set({ activeBranch: list[0] });
          return list;
        } catch { return []; }
      },

      setActiveBranch: (branch) => {
        const current = get().activeBranch?.id;
        if (current === branch?.id) return;
        set({ activeBranch: branch, cartItems: [], cartCustomer: null, inventoryMap: {}, products: [], dashboard: null });
        if (socket && branch?.id) socket.emit("join:branch", branch.id);
      },

      // ── PRODUCTS ──────────────────────────
      fetchProducts: async (params = {}) => {
        try {
          const { activeBranch } = get();
          const base = new URLSearchParams();
          if (activeBranch?.id) base.set("branchId", activeBranch.id);
          // The API caps a page at 100 records. Fetch every page so POS never silently
          // drops products when a catalog grows beyond the first page.
          base.set("limit", "100");
          if (params.search && params.search.trim()) base.set("search", params.search.trim());
          if (params.categoryId) base.set("categoryId", params.categoryId);

          const first = await api.get(`/products?${base.toString()}&page=1`);
          const firstData = first.data || {};
          const allProducts = [...(Array.isArray(firstData.products) ? firstData.products : [])];
          const pages = Math.max(1, Number(firstData.pages || 1));
          for (let page = 2; page <= pages; page++) {
            const response = await api.get(`/products?${base.toString()}&page=${page}`);
            if (Array.isArray(response.data?.products)) allProducts.push(...response.data.products);
          }

          const map = { ...get().inventoryMap };
          for (const product of allProducts) {
            for (const inv of product.inventory || []) {
              map[`${product.id}_${inv.branchId}`] = Number(inv.quantity || 0);
            }
          }
          set({ products: allProducts, inventoryMap: map });
          return allProducts;
        } catch (err) {
          console.error("fetchProducts error:", err);
          return [];
        }
      },

      fetchCategories: async () => {
        try {
          const { data } = await api.get("/categories");
          set({ categories: data });
          return data;
        } catch { return []; }
      },

      getStock: (productId) => {
        const { activeBranch, inventoryMap } = get();
        if (!activeBranch?.id) return 0;
        return inventoryMap[`${productId}_${activeBranch.id}`] ?? 0;
      },

      getFilteredProducts: () => {
        const { products, searchQuery, selectedCategory } = get();
        const query = String(searchQuery || "").trim().toLocaleLowerCase();
        return products.filter((p) => {
          if (!p.isActive) return false;
          if (selectedCategory && p.categoryId !== selectedCategory) return false;
          if (!query) return true;
          const fields = [p.name, p.displayName, p.sku, p.barcode, p.brand, p.variantLabel, p.parentProduct?.name];
          return fields.some(value => String(value || "").toLocaleLowerCase().includes(query));
        }).sort((a, b) => {
          const sa = get().getStock(a.id), sb = get().getStock(b.id);
          if (sa === 0 && sb > 0) return 1;
          if (sb === 0 && sa > 0) return -1;
          return String(a.name || "").localeCompare(String(b.name || ""));
        });
      },

      // ── CART ──────────────────────────────
      addToCart: (product) => {
        const { cartItems, activeBranch, getStock } = get();
        const stock = getStock(product.id);
        if (stock <= 0) { toast.error(`"${product.name}" غير متوفر`); return false; }

        const existing = cartItems.find((i) => i.productId === product.id && !product.hasIMEI);
        if (existing) {
          if (existing.quantity >= stock) { toast.error(`الكمية المتاحة ${stock} فقط`); return false; }
          set((s) => ({ cartItems: s.cartItems.map((i) => i.productId === product.id && !product.hasIMEI ? { ...i, quantity: i.quantity + 1 } : i) }));
        } else {
          set((s) => ({ cartItems: [...s.cartItems, { id: `${product.id}-${Date.now()}`, productId: product.id, name: product.name, sku: product.sku, unitPrice: parseFloat(product.salePrice), costPrice: parseFloat(product.costPrice), quantity: 1, discountPct: 0, hasIMEI: product.hasIMEI, imeiNumbers: [], _maxQty: stock }] }));
        }
        return true;
      },

      removeFromCart: (id) => set((s) => ({ cartItems: s.cartItems.filter((i) => i.id !== id) })),

      updateQty: (id, qty) => {
        const item = get().cartItems.find((i) => i.id === id);
        if (!item) return;
        if (qty <= 0) { get().removeFromCart(id); return; }
        if (qty > item._maxQty) { toast.error(`الكمية المتاحة ${item._maxQty} فقط`); return; }
        set((s) => ({ cartItems: s.cartItems.map((i) => i.id === id ? { ...i, quantity: qty } : i) }));
      },

      updateDiscount: (id, pct) => set((s) => ({ cartItems: s.cartItems.map((i) => i.id === id ? { ...i, discountPct: Math.max(0, Math.min(100, pct)) } : i) })),
      updatePrice: (id, price) => set((s) => ({ cartItems: s.cartItems.map((i) => i.id === id ? { ...i, unitPrice: Math.max(0, price) } : i) })),

      addIMEI: (id, imei) => {
        const item = get().cartItems.find((i) => i.id === id);
        if (!item) return { ok: false, error: "العنصر غير موجود" };
        if (item.imeiNumbers.includes(imei)) return { ok: false, error: "IMEI مضاف بالفعل" };
        if (item.imeiNumbers.length >= item.quantity) return { ok: false, error: "تم إدخال كل أرقام IMEI المطلوبة" };
        set((s) => ({ cartItems: s.cartItems.map((i) => i.id === id ? { ...i, imeiNumbers: [...i.imeiNumbers, imei] } : i) }));
        return { ok: true };
      },

      removeIMEI: (id, imei) => set((s) => ({ cartItems: s.cartItems.map((i) => i.id === id ? { ...i, imeiNumbers: i.imeiNumbers.filter((n) => n !== imei) } : i) })),

      setCustomer: (customer) => set({ cartCustomer: customer }),
      clearCustomer: () => set({ cartCustomer: null }),
      setDiscount: (v) => set({ cartDiscount: Math.max(0, v) }),
      setTaxRate: (v) => set({ cartTaxRate: Math.max(0, v) }),
      setNotes: (v) => set({ cartNotes: v }),

      getCartTotals: () => {
        const { cartItems, cartDiscount, cartTaxRate } = get();
        const subtotal = cartItems.reduce((s, i) => s + i.unitPrice * i.quantity * (1 - (i.discountPct || 0) / 100), 0);
        const afterDiscount = subtotal - (cartDiscount || 0);
        const taxAmount = afterDiscount * (cartTaxRate || 0) / 100;
        return { subtotal, afterDiscount, taxAmount, total: afterDiscount + taxAmount };
      },

      validateIMEIs: () => {
        const errors = get().cartItems.filter((i) => i.hasIMEI && i.imeiNumbers.length !== i.quantity).map((i) => `"${i.name}": مطلوب ${i.quantity} IMEI، تم إدخال ${i.imeiNumbers.length}`);
        return { valid: errors.length === 0, errors };
      },

      clearCart: () => set({ cartItems: [], cartCustomer: null, cartDiscount: 0, cartTaxRate: 0, cartNotes: "", checkoutLoading: false }),

      checkout: async (paymentMethod, amountPaid, paymentSplits = null, extra = null) => {
        const { cartItems, cartCustomer, cartDiscount, cartTaxRate, cartNotes } = get();
        if (!cartItems.length) { toast.error("السلة فارغة"); return { success: false }; }
        const imeiVal = get().validateIMEIs();
        if (!imeiVal.valid) { imeiVal.errors.forEach((e) => toast.error(e)); return { success: false }; }

        set({ checkoutLoading: true });
        try {
          const { data } = await api.post("/pos/checkout", {
            items: cartItems.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, discountPct: i.discountPct || 0, imeiNumbers: i.hasIMEI ? i.imeiNumbers : undefined })),
            customerId: cartCustomer?.id,
            paymentMethod, amountPaid, paymentSplits,
            ...(extra || {}),
            discountAmount: cartDiscount, taxRate: cartTaxRate, notes: cartNotes,
          });
          set({ lastInvoice: data.invoice, checkoutLoading: false });
          get().clearCart();
          toast.success(`✅ تم البيع! فاتورة: ${data.invoice.invoiceNumber}`);
          if (data.change > 0) toast(`💵 الباقي: ${data.change.toFixed(2)}`, { duration: 5000 });
          return { success: true, invoice: data.invoice, change: data.change };
        } catch (err) {
          const networkFailure = !err.response && (err.code === "ERR_NETWORK" || err.message === "Network Error" || !navigator.onLine);
          const offlineEligible = paymentMethod === "CASH" && !paymentSplits && cartItems.every((i) => !i.hasIMEI) && !(extra?.promotionCode) && !(Number(extra?.redeemPoints) > 0);
          if (networkFailure && offlineEligible && get().systemFeatures?.offlineMode !== false) {
            const offlineTotals = get().getCartTotals();
            const offlineItems = cartItems.map((i) => ({ productId: i.productId, productName: i.name, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice, discountPct: i.discountPct || 0, lineTotal: i.unitPrice * i.quantity * (1 - (i.discountPct || 0) / 100), imeiNumbers: [] }));
            const payload = {
              items: cartItems.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, discountPct: i.discountPct || 0 })),
              customerId: cartCustomer?.id, paymentMethod, amountPaid, discountAmount: cartDiscount, taxRate: cartTaxRate, notes: cartNotes, ...(extra || {})
            };
            const op = get().queueOfflineSale(payload);
            const offlineInvoice = { id: op.id, invoiceNumber: `OFFLINE-${op.id.slice(0, 8).toUpperCase()}`, createdAt: new Date().toISOString(), subtotal: offlineTotals.subtotal, discountAmount: cartDiscount, taxAmount: offlineTotals.taxAmount, total: offlineTotals.total, amountPaid: Number(amountPaid || offlineTotals.total), changeGiven: Math.max(0, Number(amountPaid || 0) - offlineTotals.total), paymentMethod: "CASH", items: offlineItems, offline: true };
            // Reserve stock locally to reduce accidental repeat sales on this device. Server remains authoritative at sync time.
            set((state) => {
              const map = { ...state.inventoryMap };
              for (const item of cartItems) {
                const key = `${item.productId}_${state.activeBranch?.id}`;
                map[key] = Math.max(0, (map[key] ?? item._maxQty ?? 0) - item.quantity);
              }
              return { inventoryMap: map, checkoutLoading: false, isOnline: false, lastInvoice: offlineInvoice };
            });
            get().clearCart();
            toast.success(`تم حفظ البيع Offline وسيتم رفعه تلقائياً عند رجوع الإنترنت`);
            return { success: true, offline: true, operationId: op.id, invoice: offlineInvoice, change: offlineInvoice.changeGiven };
          }
          const msg = err.response?.data?.error || "فشل إتمام البيع";
          toast.error(msg);
          set({ checkoutLoading: false });
          return { success: false, error: msg };
        }
      },

      // ── CUSTOMERS ─────────────────────────
      fetchCustomers: async (search = "") => {
        try {
          const { data } = await api.get(`/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`);
          set({ customers: data });
          return data;
        } catch { return []; }
      },

      createCustomer: async (d) => {
        try {
          const { data } = await api.post("/customers", d);
          set((s) => ({ customers: [data, ...s.customers] }));
          toast.success("تم إضافة العميل");
          return { success: true, data };
        } catch (err) {
          toast.error(err.response?.data?.error || "فشل إضافة العميل");
          return { success: false };
        }
      },

      // ── DASHBOARD ─────────────────────────
      fetchDashboard: async () => {
        try {
          const { activeBranch } = get();
          const { data } = await api.get(`/reports/dashboard${activeBranch?.id ? `?branchId=${activeBranch.id}` : ""}`);
          set({ dashboard: data });
          return data;
        } catch { return null; }
      },

      // ── LOW STOCK ─────────────────────────
      fetchLowStock: async () => {
        try {
          const { activeBranch } = get();
          const { data } = await api.get(`/inventory/low-stock${activeBranch?.id ? `?branchId=${activeBranch.id}` : ""}`);
          set({ lowStockItems: data });
          return data;
        } catch { return []; }
      },

      // ── HYBRID / OFFLINE SYNC ───────────────
      setOnlineStatus: (value) => set({ isOnline: Boolean(value) }),
      queueOfflineSale: (payload) => {
        if (get().systemFeatures?.offlineMode === false) return { error: get().language === "en" ? "Offline mode is disabled by the system administrator." : "وضع عدم الاتصال معطل بواسطة مسؤول النظام" };
        const id = (globalThis.crypto?.randomUUID?.() || `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`);
        const op = { id, type: "SALE", status: "PENDING", createdAt: new Date().toISOString(), payload: { ...payload, clientOperationId: id }, error: null };
        set((state) => ({ offlineQueue: [...state.offlineQueue, op] }));
        return op;
      },
      syncOfflineQueue: async () => {
        if (get().systemFeatures?.offlineMode === false || get().systemFeatures?.sync === false) return;
        if (!get().isOnline || get().syncInProgress || !get().token) return;
        const pending = get().offlineQueue.filter((x) => x.status === "PENDING" || x.status === "FAILED");
        if (!pending.length) { set({ lastSyncAt: new Date().toISOString() }); return; }
        set({ syncInProgress: true });
        for (const op of pending) {
          try {
            if (op.type === "SALE") await api.post("/pos/checkout", op.payload);
            set((state) => ({ offlineQueue: state.offlineQueue.map((x) => x.id === op.id ? { ...x, status: "SYNCED", syncedAt: new Date().toISOString(), error: null } : x) }));
          } catch (err) {
            const message = err.response?.data?.error || err.message || "فشل المزامنة";
            set((state) => ({ offlineQueue: state.offlineQueue.map((x) => x.id === op.id ? { ...x, status: "FAILED", error: message } : x) }));
          }
        }
        set({ syncInProgress: false, lastSyncAt: new Date().toISOString() });
        try { await get().fetchProducts(); await get().fetchDashboard(); } catch {}
      },

      // ── UI ────────────────────────────────
      setModule: (m) => set({ activeModule: m }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSearch: (q) => set({ searchQuery: q }),
      setCategory: (c) => set({ selectedCategory: c }),
    }),
    {
      name: "erp-pos-store",
      partialize: (s) => ({ token: s.token, user: s.user, activeBranch: s.activeBranch, cartTaxRate: s.cartTaxRate, sidebarOpen: s.sidebarOpen, language: s.language || "ar", products: s.products, categories: s.categories, inventoryMap: s.inventoryMap, offlineQueue: s.offlineQueue, lastSyncAt: s.lastSyncAt, systemFeatures: s.systemFeatures || {} }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          state.isAuthenticated = true;
          const sock = initSocket(state.token, state.activeBranch?.id);
          state.socket = sock;
          sock.on("inventory:update", ({ productId, branchId, quantity }) => {
            useStore.setState((s) => ({ inventoryMap: { ...s.inventoryMap, [`${productId}_${branchId}`]: quantity } }));
          });
        }
      },
    }
  )
);
