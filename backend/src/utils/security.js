export function normalizeText(value, max = 255) {
  if (value == null) return null;
  return String(value).trim().slice(0, max);
}

export function positiveInt(value, field = "الكمية") {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${field} يجب أن تكون رقماً صحيحاً أكبر من صفر`);
  return n;
}

export function money(value, field = "القيمة", { allowZero = true } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new Error(`${field} غير صالحة`);
  return n;
}

export function pageParams(query, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit || String(defaultLimit), 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
