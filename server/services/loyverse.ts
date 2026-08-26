import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { requireDb } from "../db";
import {
  loyverseCategories,
  loyverseInventoryLevels,
  posSettings,
  loyverseItems,
  loyverseReceiptLines,
  loyverseReceiptPayments,
  loyverseReceipts,
  loyverseShifts,
  loyverseStores,
  loyverseSyncState,
  loyverseVariantPrices,
  loyverseVariants,
} from "../../drizzle/schema";

const DEFAULT_API_BASE = "https://api.loyverse.com/v1.0";
const PAGE_LIMIT = 250;
const MAX_PAGES = 1000;
const REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_SALES_LOOKBACK_DAYS = 31;
const MAX_SALES_RANGE_DAYS = 14;
const MAX_SALES_HISTORY_DAYS = 31;

let activeSync: Promise<unknown> | null = null;

type JsonObject = Record<string, any>;
type SyncDateRange = { from?: Date; to?: Date };

async function getRuntimeConfig() {
  const database = requireDb();
  const rows = await database.select({ apiBaseUrl: posSettings.loyverseApiBaseUrl, token: posSettings.loyverseApiToken, storeId: posSettings.loyverseStoreId }).from(posSettings).limit(1);
  const row = rows[0];
  return {
    apiBaseUrl: (row?.apiBaseUrl?.trim() || process.env.LOYVERSE_API_BASE_URL?.trim() || DEFAULT_API_BASE).replace(/\/$/, ""),
    token: row?.token?.trim() || process.env.LOYVERSE_API_TOKEN?.trim() || "",
    storeId: row?.storeId?.trim() || process.env.LOYVERSE_STORE_ID?.trim() || "",
  };
}

async function ensureConfigured() {
  const config = await getRuntimeConfig();
  if (!config.token) {
    throw new Error("Loyverse no está configurado. Guarda el token desde Administración → Loyverse o añade LOYVERSE_API_TOKEN en el servidor.");
  }
  return config;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function asArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonObject => Boolean(entry && typeof entry === "object" && !Array.isArray(entry))) : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asDecimal(value: unknown, scale = 2) {
  return asNumber(value).toFixed(scale);
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateParam(value?: Date) {
  return value?.toISOString();
}

function normalizedSalesRange(range: SyncDateRange): Required<SyncDateRange> {
  const to = range.to || new Date();
  const from = range.from || new Date(to.getTime() - (DEFAULT_SALES_LOOKBACK_DAYS - 1) * 24 * 60 * 60 * 1000);
  if (from.getTime() > to.getTime()) throw new Error("El periodo de ventas de Loyverse no es válido: la fecha inicial es posterior a la final.");
  const earliestAllowed = Date.now() - MAX_SALES_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  if (from.getTime() < earliestAllowed) throw new Error(`Loyverse solo permite consultar ventas de los últimos ${MAX_SALES_HISTORY_DAYS} días con el plan actual.`);
  const maximumRangeMs = MAX_SALES_RANGE_DAYS * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maximumRangeMs) throw new Error(`El tramo de ventas no puede superar ${MAX_SALES_RANGE_DAYS} días. Selecciona un periodo menor o utiliza la sincronización por tramos.`);
  return { from, to };
}

async function runBatches<T>(items: T[], worker: (item: T) => Promise<void>, batchSize = 5) {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map(worker));
  }
}

async function loyverseRequest(path: string, params: Record<string, string | undefined> = {}) {
  const config = await ensureConfigured();
  const url = new URL(`${config.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") url.searchParams.set(key, value); });
  const response = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${config.token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.text();
  let payload: unknown = null;
  try { payload = body ? JSON.parse(body) : null; } catch { payload = body; }
  if (!response.ok) {
    const errorBody = asObject(payload);
    const detail = asArray(errorBody.errors).map((error) => asString(error.details) || asString(error.code)).filter(Boolean).join(", ");
    throw new Error(`Loyverse respondió HTTP ${response.status}${detail ? `: ${detail}` : ""}.`);
  }
  return asObject(payload);
}

async function fetchAll(path: string, collectionKey: string, params: Record<string, string | undefined> = {}) {
  const all: JsonObject[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await loyverseRequest(path, { ...params, limit: String(PAGE_LIMIT), cursor });
    const entries = asArray(response[collectionKey]);
    all.push(...entries);
    cursor = asString(response.cursor) ?? undefined;
    if (!cursor || entries.length === 0) break;
  }
  if (cursor) throw new Error("Loyverse devolvió demasiadas páginas; detén la sincronización y revisa el rango solicitado.");
  return all;
}

async function getSyncRow() {
  const database = requireDb();
  const rows = await database.select().from(loyverseSyncState).orderBy(asc(loyverseSyncState.id)).limit(1);
  return rows[0];
}

async function saveSyncState(values: Partial<typeof loyverseSyncState.$inferInsert>) {
  const database = requireDb();
  const current = await getSyncRow();
  if (!current) {
    await database.insert(loyverseSyncState).values(values);
    return getSyncRow();
  }
  await database.update(loyverseSyncState).set(values).where(eq(loyverseSyncState.id, current.id));
  return getSyncRow();
}

export async function testLoyverseConnection() {
  const config = await ensureConfigured();
  const merchant = await loyverseRequest("/merchant");
  return { success: true, merchantName: asString(merchant.name), apiBase: config.apiBaseUrl };
}

export async function getLoyverseStatus() {
  const state = await getSyncRow();
  const runtimeConfig = await getRuntimeConfig();
  const database = requireDb();
  const [stores, categories, items, variants, prices, inventory, receipts, lines, shifts] = await Promise.all([
    database.select({ count: loyverseStores.id }).from(loyverseStores),
    database.select({ count: loyverseCategories.id }).from(loyverseCategories),
    database.select({ count: loyverseItems.id }).from(loyverseItems),
    database.select({ count: loyverseVariants.id }).from(loyverseVariants),
    database.select({ count: loyverseVariantPrices.id }).from(loyverseVariantPrices),
    database.select({ count: loyverseInventoryLevels.id }).from(loyverseInventoryLevels),
    database.select({ count: loyverseReceipts.id }).from(loyverseReceipts),
    database.select({ count: loyverseReceiptLines.id }).from(loyverseReceiptLines),
    database.select({ count: loyverseShifts.id }).from(loyverseShifts),
  ]);
  return {
    configured: Boolean(runtimeConfig.token),
    apiBase: runtimeConfig.apiBaseUrl,
    state: state ? { ...state, lastSyncError: state.lastSyncError } : null,
    counts: { stores: stores.length, categories: categories.length, items: items.length, variants: variants.length, prices: prices.length, inventoryLevels: inventory.length, receipts: receipts.length, receiptLines: lines.length, shifts: shifts.length },
  };
}

async function upsertStore(store: JsonObject) {
  const database = requireDb();
  const loyverseId = asString(store.id);
  if (!loyverseId) return;
  const values = {
    loyverseId,
    name: asString(store.name) || "Sin nombre",
    timezone: asString(store.timezone),
    deletedAt: asDate(store.deleted_at),
    remoteCreatedAt: asDate(store.created_at),
    remoteUpdatedAt: asDate(store.updated_at),
    rawData: store,
  };
  await database.insert(loyverseStores).values(values).onDuplicateKeyUpdate({ set: values });
}

async function upsertCategory(category: JsonObject) {
  const database = requireDb();
  const loyverseId = asString(category.id);
  if (!loyverseId) return;
  const values = {
    loyverseId,
    name: asString(category.name) || "Sin nombre",
    color: asString(category.color),
    deletedAt: asDate(category.deleted_at),
    remoteCreatedAt: asDate(category.created_at),
    remoteUpdatedAt: asDate(category.updated_at),
    rawData: category,
  };
  await database.insert(loyverseCategories).values(values).onDuplicateKeyUpdate({ set: values });
}

async function upsertItem(item: JsonObject) {
  const database = requireDb();
  const loyverseId = asString(item.id);
  if (!loyverseId) return;
  const values = {
    loyverseId,
    itemName: asString(item.item_name) || "Sin nombre",
    referenceId: asString(item.reference_id),
    categoryLoyverseId: asString(item.category_id),
    imageUrl: asString(item.image_url),
    trackStock: Boolean(item.track_stock),
    soldByWeight: Boolean(item.sold_by_weight),
    isComposite: Boolean(item.is_composite),
    deletedAt: asDate(item.deleted_at),
    remoteCreatedAt: asDate(item.created_at),
    remoteUpdatedAt: asDate(item.updated_at),
    rawData: item,
  };
  await database.insert(loyverseItems).values(values).onDuplicateKeyUpdate({ set: values });
  for (const rawVariant of asArray(item.variants)) await upsertVariant(rawVariant, loyverseId);
}

async function upsertVariant(variant: JsonObject, itemLoyverseId?: string) {
  const database = requireDb();
  const loyverseId = asString(variant.variant_id) || asString(variant.id);
  const itemId = itemLoyverseId || asString(variant.item_id);
  if (!loyverseId || !itemId) return;
  const values = {
    loyverseId,
    itemLoyverseId: itemId,
    sku: asString(variant.sku),
    barcode: asString(variant.barcode),
    option1Value: asString(variant.option1_value),
    option2Value: asString(variant.option2_value),
    option3Value: asString(variant.option3_value),
    cost: variant.cost === null || variant.cost === undefined ? null : asDecimal(variant.cost),
    purchaseCost: variant.purchase_cost === null || variant.purchase_cost === undefined ? null : asDecimal(variant.purchase_cost),
    defaultPrice: variant.default_price === null || variant.default_price === undefined ? null : asDecimal(variant.default_price),
    deletedAt: asDate(variant.deleted_at),
    remoteCreatedAt: asDate(variant.created_at),
    remoteUpdatedAt: asDate(variant.updated_at),
    rawData: variant,
  };
  await database.insert(loyverseVariants).values(values).onDuplicateKeyUpdate({ set: values });
  for (const rawStore of asArray(variant.stores)) {
    const storeLoyverseId = asString(rawStore.store_id);
    if (!storeLoyverseId) continue;
    const priceValues = {
      variantLoyverseId: loyverseId,
      storeLoyverseId,
      pricingType: asString(rawStore.pricing_type),
      price: rawStore.price === null || rawStore.price === undefined ? null : asDecimal(rawStore.price),
      availableForSale: rawStore.available_for_sale !== false,
      optimalStock: rawStore.optimal_stock === null || rawStore.optimal_stock === undefined ? null : asDecimal(rawStore.optimal_stock, 3),
      lowStock: rawStore.low_stock === null || rawStore.low_stock === undefined ? null : asDecimal(rawStore.low_stock, 3),
      rawData: rawStore,
    };
    await database.insert(loyverseVariantPrices).values(priceValues).onDuplicateKeyUpdate({ set: priceValues });
  }
}

async function upsertInventory(level: JsonObject) {
  const database = requireDb();
  const variantLoyverseId = asString(level.variant_id);
  const storeLoyverseId = asString(level.store_id);
  if (!variantLoyverseId || !storeLoyverseId) return;
  const values = {
    variantLoyverseId,
    storeLoyverseId,
    inStock: asDecimal(level.in_stock, 3),
    remoteUpdatedAt: asDate(level.updated_at),
    rawData: level,
  };
  await database.insert(loyverseInventoryLevels).values(values).onDuplicateKeyUpdate({ set: values });
}

function receiptDate(receipt: JsonObject) {
  return asDate(receipt.receipt_date) || asDate(receipt.created_at) || asDate(receipt.updated_at);
}

async function upsertReceipt(receipt: JsonObject, itemNames: Map<string, string>) {
  const database = requireDb();
  const receiptNumber = asString(receipt.receipt_number);
  if (!receiptNumber) return;
  const values = {
    receiptNumber,
    storeLoyverseId: asString(receipt.store_id),
    receiptType: asString(receipt.receipt_type),
    refundFor: asString(receipt.refund_for),
    receiptDate: receiptDate(receipt),
    cancelledAt: asDate(receipt.cancelled_at),
    totalMoney: asDecimal(receipt.total_money),
    totalTax: asDecimal(receipt.total_tax),
    totalDiscount: asDecimal(receipt.total_discounts ?? receipt.total_discount),
    rawData: receipt,
  };
  await database.insert(loyverseReceipts).values(values).onDuplicateKeyUpdate({ set: values });
  const localReceipt = await database.select({ id: loyverseReceipts.id }).from(loyverseReceipts).where(eq(loyverseReceipts.receiptNumber, receiptNumber)).limit(1);
  const receiptId = localReceipt[0]?.id;
  if (!receiptId) return;
  await database.delete(loyverseReceiptLines).where(eq(loyverseReceiptLines.receiptId, receiptId));
  await database.delete(loyverseReceiptPayments).where(eq(loyverseReceiptPayments.receiptId, receiptId));
  const lineItems = asArray(receipt.line_items);
  for (let index = 0; index < lineItems.length; index += 1) {
    const line = lineItems[index];
    const itemId = asString(line.item_id);
    const valuesLine = {
      receiptId,
      lineIndex: index,
      itemLoyverseId: itemId,
      variantLoyverseId: asString(line.variant_id),
      itemName: asString(line.item_name) || (itemId ? itemNames.get(itemId) : null) || "Artículo Loyverse",
      quantity: asDecimal(line.quantity, 3),
      price: asDecimal(line.price),
      grossTotalMoney: asDecimal(line.gross_total_money ?? line.total_money),
      totalMoney: asDecimal(line.total_money),
      cost: asDecimal(line.cost),
      costTotal: asDecimal(line.cost_total),
      rawData: line,
    };
    await database.insert(loyverseReceiptLines).values(valuesLine);
  }
  for (let index = 0; index < asArray(receipt.payments).length; index += 1) {
    const payment = asArray(receipt.payments)[index];
    await database.insert(loyverseReceiptPayments).values({ receiptId, paymentIndex: index, paymentTypeId: asString(payment.payment_type_id), moneyAmount: asDecimal(payment.money_amount), rawData: payment });
  }
}

async function upsertShift(shift: JsonObject) {
  const database = requireDb();
  const loyverseId = asString(shift.id);
  if (!loyverseId) return;
  const values = {
    loyverseId,
    storeLoyverseId: asString(shift.store_id),
    openedAt: asDate(shift.opened_at) || asDate(shift.created_at),
    closedAt: asDate(shift.closed_at),
    startingCash: asDecimal(shift.starting_cash),
    cashPayments: asDecimal(shift.cash_payments),
    cashRefunds: asDecimal(shift.cash_refunds),
    paidIn: asDecimal(shift.paid_in),
    paidOut: asDecimal(shift.paid_out),
    rawData: shift,
  };
  await database.insert(loyverseShifts).values(values).onDuplicateKeyUpdate({ set: values });
}

export async function syncLoyverseCatalog() {
  const config = await ensureConfigured();
  const startedAt = new Date();
  await saveSyncState({ lastSyncStartedAt: startedAt, lastSyncStatus: "running", lastSyncError: null });
  try {
    const merchant = await loyverseRequest("/merchant");
    const stores = await fetchAll("/stores", "stores", { show_deleted: "true" });
    const categories = await fetchAll("/categories", "categories", { show_deleted: "true" });
    const items = await fetchAll("/items", "items", { show_deleted: "true" });
    await runBatches(stores, upsertStore);
    await runBatches(categories, upsertCategory);
    await runBatches(items, upsertItem, 4);
    const storeIds = stores.map((store) => asString(store.id)).filter((id): id is string => Boolean(id));
    const inventory = await fetchAll("/inventory", "inventory_levels", { store_ids: storeIds.length ? storeIds.join(",") : undefined });
    await runBatches(inventory, upsertInventory, 8);
    const activeStoreId = config.storeId || storeIds[0] || null;
    const activeStore = stores.find((store) => asString(store.id) === activeStoreId);
    const finishedAt = new Date();
    await saveSyncState({ merchantId: asString(merchant.id), merchantName: asString(merchant.name), activeStoreId, activeStoreName: asString(activeStore?.name), catalogSyncedAt: finishedAt, lastSyncFinishedAt: finishedAt, lastSyncStatus: "success", lastSyncError: null });
    return { success: true, merchantName: asString(merchant.name), stores: stores.length, categories: categories.length, items: items.length, inventoryLevels: inventory.length, syncedAt: finishedAt.toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al sincronizar Loyverse.";
    await saveSyncState({ lastSyncFinishedAt: new Date(), lastSyncStatus: "error", lastSyncError: message });
    throw error;
  }
}

export async function getLoyverseSalesRange(storeId?: string) {
  const config = await ensureConfigured();
  const receipts = await fetchAll("/receipts", "receipts", { store_id: storeId?.trim() || config.storeId || undefined });
  const datedReceipts = receipts.map((receipt) => ({ receipt, date: receiptDate(receipt) })).filter((entry): entry is { receipt: JsonObject; date: Date } => Boolean(entry.date)).sort((left, right) => left.date.getTime() - right.date.getTime());
  const first = datedReceipts[0];
  const last = datedReceipts[datedReceipts.length - 1];
  return {
    firstReceiptDate: first?.date.toISOString() || null,
    lastReceiptDate: last?.date.toISOString() || null,
    firstReceiptNumber: first ? asString(first.receipt.receipt_number) : null,
    lastReceiptNumber: last ? asString(last.receipt.receipt_number) : null,
    receiptCount: receipts.length,
  };
}

export async function syncLoyverseSales(range: SyncDateRange = {}, requestedStoreId?: string) {
  const config = await ensureConfigured();
  const selectedStoreId = requestedStoreId?.trim() || config.storeId || undefined;
  const effectiveRange = normalizedSalesRange(range);
  const startedAt = new Date();
  await saveSyncState({ lastSyncStartedAt: startedAt, lastSyncStatus: "running", lastSyncError: null });
  try {
    const database = requireDb();
    const [items, receipts, shifts] = await Promise.all([
      database.select().from(loyverseItems),
      fetchAll("/receipts", "receipts", { created_at_min: dateParam(effectiveRange.from), created_at_max: dateParam(effectiveRange.to), store_id: selectedStoreId }),
      fetchAll("/shifts", "shifts", { created_at_min: dateParam(effectiveRange.from), created_at_max: dateParam(effectiveRange.to), store_ids: selectedStoreId }),
    ]);
    const itemNames = new Map(items.map((item) => [item.loyverseId, item.itemName]));
    await runBatches(receipts, (receipt) => upsertReceipt(receipt, itemNames), 4);
    await runBatches(shifts, upsertShift, 8);
    const finishedAt = new Date();
    await saveSyncState({ salesSyncedAt: finishedAt, lastSyncFinishedAt: finishedAt, lastSyncStatus: "success", lastSyncError: null });
    return { success: true, receipts: receipts.length, shifts: shifts.length, syncedAt: finishedAt.toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al sincronizar las ventas de Loyverse.";
    await saveSyncState({ lastSyncFinishedAt: new Date(), lastSyncStatus: "error", lastSyncError: message });
    throw error;
  }
}

export async function syncLoyverseAll(range: SyncDateRange = {}) {
  if (activeSync) throw new Error("Ya hay una sincronización de Loyverse en curso.");
  activeSync = (async () => {
    await syncLoyverseCatalog();
    return syncLoyverseSales(range);
  })();
  try { return await activeSync; } finally { activeSync = null; }
}

function dateRangeWhere(range: SyncDateRange) {
  const conditions = [];
  if (range.from) conditions.push(gte(loyverseReceipts.receiptDate, range.from));
  if (range.to) conditions.push(lte(loyverseReceipts.receiptDate, range.to));
  return conditions.length ? and(...conditions) : undefined;
}

function madridHour(date: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(date);
}

function madridDate(date: Date | null) {
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export async function getLoyverseDashboard(range: SyncDateRange = {}, storeId?: string) {
  const runtimeConfig = await getRuntimeConfig();
  const database = requireDb();
  const receiptWhere = dateRangeWhere(range);
  const receipts = await database.select().from(loyverseReceipts).where(receiptWhere).orderBy(desc(loyverseReceipts.receiptDate)).limit(5000);
  const receiptIds = receipts.map((receipt) => receipt.id);
  const allLines = receiptIds.length ? await database.select().from(loyverseReceiptLines).orderBy(asc(loyverseReceiptLines.receiptId), asc(loyverseReceiptLines.lineIndex)) : [];
  const lines = receiptIds.length ? allLines.filter((line) => receiptIds.includes(line.receiptId)) : [];
  const stores = await database.select().from(loyverseStores).orderBy(asc(loyverseStores.name));
  const categories = await database.select().from(loyverseCategories).orderBy(asc(loyverseCategories.name));
  const items = await database.select().from(loyverseItems).orderBy(asc(loyverseItems.itemName));
  const variants = await database.select().from(loyverseVariants).orderBy(asc(loyverseVariants.sku));
  const prices = await database.select().from(loyverseVariantPrices).where(storeId ? eq(loyverseVariantPrices.storeLoyverseId, storeId) : undefined);
  const inventory = await database.select().from(loyverseInventoryLevels).where(storeId ? eq(loyverseInventoryLevels.storeLoyverseId, storeId) : undefined);
  const selectedStoreId = storeId || (await getSyncRow())?.activeStoreId || stores[0]?.loyverseId || null;
  const categoryMap = new Map(categories.map((category) => [category.loyverseId, category.name]));
  const variantsByItem = new Map<string, typeof variants>();
  variants.forEach((variant) => variantsByItem.set(variant.itemLoyverseId, [...(variantsByItem.get(variant.itemLoyverseId) || []), variant]));
  const priceMap = new Map(prices.filter((price) => price.storeLoyverseId === selectedStoreId).map((price) => [price.variantLoyverseId, price]));
  const stockMap = new Map(inventory.filter((level) => level.storeLoyverseId === selectedStoreId).map((level) => [level.variantLoyverseId, Number(level.inStock)]));
  const catalog = items.map((item) => {
    const itemVariants = variantsByItem.get(item.loyverseId) || [];
    const itemPrices = itemVariants.map((variant) => priceMap.get(variant.loyverseId)).filter(Boolean);
    const itemStocks = itemVariants.map((variant) => stockMap.get(variant.loyverseId) ?? 0);
    const firstVariant = itemVariants[0];
    const firstPrice = firstVariant ? priceMap.get(firstVariant.loyverseId) : undefined;
    return { id: item.loyverseId, name: item.itemName, category: item.categoryLoyverseId ? categoryMap.get(item.categoryLoyverseId) || "Sin familia" : "Sin familia", imageUrl: item.imageUrl, sku: firstVariant?.sku || null, barcode: firstVariant?.barcode || null, variants: itemVariants.length, price: firstPrice?.price === null || firstPrice?.price === undefined ? firstVariant?.defaultPrice : firstPrice.price, stock: itemStocks.reduce((sum, value) => sum + value, 0), availableForSale: itemPrices.length === 0 ? true : itemPrices.some((price) => price?.availableForSale !== false), deleted: Boolean(item.deletedAt), updatedAt: item.remoteUpdatedAt };
  });
  const selectedReceipts = selectedStoreId ? receipts.filter((receipt) => !receipt.storeLoyverseId || receipt.storeLoyverseId === selectedStoreId) : receipts;
  const selectedReceiptIds = new Set(selectedReceipts.map((receipt) => receipt.id));
  const allPayments = selectedReceipts.length ? await database.select().from(loyverseReceiptPayments) : [];
  const cashTotal = selectedReceipts.reduce((sum, receipt) => sum + (unifiedPaymentMethod(receipt.id, allPayments) === "cash" ? Number(receipt.totalMoney) : 0), 0);
  const cardTotal = selectedReceipts.reduce((sum, receipt) => sum + (unifiedPaymentMethod(receipt.id, allPayments) === "card" ? Number(receipt.totalMoney) : 0), 0);
  const selectedLines = lines.filter((line) => selectedReceiptIds.has(line.receiptId));
  const totalSold = selectedReceipts.reduce((sum, receipt) => sum + Number(receipt.totalMoney), 0);
  const totalTax = selectedReceipts.reduce((sum, receipt) => sum + Number(receipt.totalTax), 0);
  const totalDiscount = selectedReceipts.reduce((sum, receipt) => sum + Number(receipt.totalDiscount), 0);
  const totalCost = selectedLines.reduce((sum, line) => sum + Number(line.costTotal), 0);
  const topProductsMap = new Map<string, { productName: string; units: number; revenue: number; cost: number }>();
  const hourMap = new Map<string, { hour: string; tickets: number; total: number }>();
  const dayMap = new Map<string, { date: string; tickets: number; total: number }>();
  selectedLines.forEach((line) => {
    const previous = topProductsMap.get(line.itemName) || { productName: line.itemName, units: 0, revenue: 0, cost: 0 };
    previous.units += Number(line.quantity); previous.revenue += Number(line.totalMoney); previous.cost += Number(line.costTotal); topProductsMap.set(line.itemName, previous);
  });
  selectedReceipts.forEach((receipt) => {
    const hour = madridHour(receipt.receiptDate);
    const hourPrevious = hourMap.get(hour) || { hour, tickets: 0, total: 0 }; hourPrevious.tickets += 1; hourPrevious.total += Number(receipt.totalMoney); hourMap.set(hour, hourPrevious);
    const date = madridDate(receipt.receiptDate);
    const dayPrevious = dayMap.get(date) || { date, tickets: 0, total: 0 }; dayPrevious.tickets += 1; dayPrevious.total += Number(receipt.totalMoney); dayMap.set(date, dayPrevious);
  });
  return {
    configured: Boolean(runtimeConfig.token),
    selectedStoreId,
    stores,
    catalog,
    sales: { from: range.from?.toISOString() || null, to: range.to?.toISOString() || null, tickets: selectedReceipts.length, totalSold, totalTax, totalDiscount, totalCost, cash: cashTotal, card: cardTotal, margin: totalSold - totalCost, byHour: [...hourMap.values()].sort((a, b) => a.hour.localeCompare(b.hour)), byDate: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)), topProducts: [...topProductsMap.values()].sort((a, b) => b.units - a.units).slice(0, 50), recentReceipts: selectedReceipts.slice(0, 100) },
    updatedAt: (await getSyncRow())?.updatedAt || null,
  };
}






type UnifiedReportRange = { from?: Date; to?: Date };

function unifiedMoney(value: number) { return value.toFixed(2); }

function unifiedRange(period = "quarter", from?: string, to?: string): UnifiedReportRange {
  if (period === "custom" && from && to) return { from: new Date(`${from}T00:00:00Z`), to: new Date(`${to}T23:59:59Z`) };
  const end = new Date();
  const start = new Date(end);
  if (period === "day") start.setDate(end.getDate());
  else if (period === "week") start.setDate(end.getDate() - 6);
  else if (period === "month") start.setDate(1);
  else if (period === "year") { start.setMonth(0, 1); }
  else { start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1); }
  start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
  return { from: start, to: end };
}

function unifiedPaymentMethod(receiptId: number, payments: typeof loyverseReceiptPayments.$inferSelect[]) {
  const labels = payments.filter((payment) => payment.receiptId === receiptId).map((payment) => {
    const raw = asObject(payment.rawData);
    return `${asString(raw.type) || ""} ${asString(raw.name) || ""} ${asString(raw.payment_type) || ""}`.toLowerCase();
  }).join(" ");
  if (/card|tarjet|credit|debit|visa|master/.test(labels)) return "card" as const;
  if (/cash|efect|contado/.test(labels)) return "cash" as const;
  return null;
}

export async function shouldUseLoyverseSales() {
  const config = await getRuntimeConfig();
  if (!config.token) return false;
  const database = requireDb();
  return (await database.select({ id: loyverseReceipts.id }).from(loyverseReceipts).limit(1)).length > 0;
}

export async function getLoyverseRecentSales(limit = 100) {
  const database = requireDb();
  const rows = await database.select().from(loyverseReceipts).orderBy(desc(loyverseReceipts.receiptDate)).limit(Math.max(1, Math.min(limit, 500)));
  const ids = rows.map((row) => row.id);
  const payments = ids.length ? await database.select().from(loyverseReceiptPayments) : [];
  return rows.map((row) => ({ id: row.id, saleNumber: row.receiptNumber, totalAmount: row.totalMoney, status: row.receiptType === "REFUND" ? "refunded" : "completed", createdAt: (row.receiptDate || row.updatedAt || row.createdAt).toISOString(), method: unifiedPaymentMethod(row.id, payments), source: "loyverse" as const }));
}

export async function getLoyverseReceiptDetails(receiptId: number) {
  const database = requireDb();
  const rows = await database.select().from(loyverseReceipts).where(eq(loyverseReceipts.id, receiptId)).limit(1);
  if (!rows[0]) throw new Error("No se encontró el ticket de Loyverse.");
  const lines = await database.select().from(loyverseReceiptLines).where(eq(loyverseReceiptLines.receiptId, receiptId)).orderBy(asc(loyverseReceiptLines.lineIndex));
  const payments = await database.select().from(loyverseReceiptPayments).where(eq(loyverseReceiptPayments.receiptId, receiptId));
  const receipt = rows[0];
  return { ...receipt, saleNumber: receipt.receiptNumber, totalAmount: receipt.totalMoney, subtotal: unifiedMoney(Number(receipt.totalMoney) - Number(receipt.totalTax)), vatAmount: receipt.totalTax, status: receipt.receiptType === "REFUND" ? "refunded" : "completed", createdAt: (receipt.receiptDate || receipt.updatedAt || receipt.createdAt).toISOString(), payment: { method: unifiedPaymentMethod(receipt.id, payments), amount: receipt.totalMoney }, lines: lines.map((line) => ({ id: line.id, productName: line.itemName, quantity: line.quantity, unitPrice: line.price, lineVat: "0.00", lineTotal: line.totalMoney })) };
}

export async function getLoyverseReports(input: { period?: string; from?: string; to?: string } = {}) {
  const period = input.period || "quarter";
  const range = unifiedRange(period, input.from, input.to);
  const dashboard = await getLoyverseDashboard(range);
  const sales = dashboard.sales;
  const totalSold = Number(sales.totalSold);
  const totalTax = Number(sales.totalTax);
  const totalCost = Number(sales.totalCost);
  return {
    period, from: range.from?.toISOString().slice(0, 10) || null, to: range.to?.toISOString().slice(0, 10) || null,
    totals: { totalSold: unifiedMoney(totalSold), subtotal: unifiedMoney(totalSold - totalTax), vat: unifiedMoney(totalTax), cash: unifiedMoney(Number(sales.cash || 0)), card: unifiedMoney(Number(sales.card || 0)), cost: unifiedMoney(totalCost), margin: unifiedMoney(totalSold - totalCost), tickets: sales.tickets },
    series: sales.byDate.map((entry) => ({ label: entry.date, total: unifiedMoney(Number(entry.total)), tickets: entry.tickets, cash: "0.00", card: "0.00" })),
    topProducts: sales.topProducts.map((entry) => ({ productId: null, productName: entry.productName, units: Number(entry.units).toFixed(3), revenue: unifiedMoney(Number(entry.revenue)), cost: unifiedMoney(Number(entry.cost)), margin: unifiedMoney(Number(entry.revenue) - Number(entry.cost)) })),
    byFamily: (() => {
      const familyMap = new Map<string, { units: number; revenue: number; cost: number }>();
      for (const product of sales.topProducts) {
        const family = dashboard.catalog.find((catalogItem) => catalogItem.name === product.productName)?.category || "Sin familia";
        const current = familyMap.get(family) || { units: 0, revenue: 0, cost: 0 };
        current.units += Number(product.units); current.revenue += Number(product.revenue); current.cost += Number(product.cost); familyMap.set(family, current);
      }
      return [...familyMap.entries()].sort(([, left], [, right]) => right.revenue - left.revenue).map(([family, value]) => ({ family, units: value.units.toFixed(3), revenue: unifiedMoney(value.revenue), cost: unifiedMoney(value.cost), margin: unifiedMoney(value.revenue - value.cost) }));
    })(),
    vatBreakdown: [{ vat: "IVA según recibos Loyverse", revenue: unifiedMoney(totalSold), vatAmount: unifiedMoney(totalTax), units: "0.000" }],
  };
}

export async function getLoyverseSalesByProduct() {
  const report = await getLoyverseReports({ period: "year" });
  return report.topProducts;
}

export async function getLoyverseDailyAnalysis() {
  const report = await getLoyverseReports({ period: "day" });
  return { businessDate: new Date().toISOString().slice(0, 10), sessionId: 0, status: "open" as const, totalSold: report.totals.totalSold, cashSold: report.totals.cash, cardSold: report.totals.card, expectedCash: report.totals.cash, tickets: report.totals.tickets, hourly: report.series.map((entry) => ({ hour: 0, label: entry.label, total: entry.total, tickets: entry.tickets, cash: entry.cash, card: entry.card })), topProducts: report.topProducts.slice(0, 10) };
}


function mergeMoney(left: string | number, right: string | number) { return (Number(left) + Number(right)).toFixed(2); }

function mergeSeriesRows(remote: Array<{ label: string; total: string; tickets: number; cash: string; card: string }>, local: Array<{ label: string; total: string; tickets: number; cash: string; card: string }>) {
  const map = new Map<string, { label: string; total: number; tickets: number; cash: number; card: number }>();
  for (const row of [...remote, ...local]) {
    const current = map.get(row.label) || { label: row.label, total: 0, tickets: 0, cash: 0, card: 0 };
    current.total += Number(row.total); current.tickets += row.tickets; current.cash += Number(row.cash); current.card += Number(row.card); map.set(row.label, current);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label)).map((row) => ({ ...row, total: row.total.toFixed(2), cash: row.cash.toFixed(2), card: row.card.toFixed(2) }));
}

function mergeProductRows(remote: Array<{ productId: number | null; productName: string; units: string; revenue: string; cost: string; margin: string }>, local: Array<{ productId: number | null; productName: string; units: string; revenue: string; cost: string; margin: string }>) {
  const map = new Map<string, { productId: number | null; productName: string; units: number; revenue: number; cost: number }>();
  for (const row of [...remote, ...local]) {
    const key = row.productName.trim().toLocaleLowerCase("es");
    const current = map.get(key) || { productId: row.productId, productName: row.productName, units: 0, revenue: 0, cost: 0 };
    current.units += Number(row.units); current.revenue += Number(row.revenue); current.cost += Number(row.cost); map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).map((row) => ({ productId: row.productId, productName: row.productName, units: row.units.toFixed(3), revenue: row.revenue.toFixed(2), cost: row.cost.toFixed(2), margin: (row.revenue - row.cost).toFixed(2) }));
}

function mergeFamilyRows(remote: Array<{ family: string; units: string; revenue: string; cost: string; margin: string }>, local: Array<{ family: string; units: string; revenue: string; cost: string; margin: string }>) {
  const map = new Map<string, { family: string; units: number; revenue: number; cost: number }>();
  for (const row of [...remote, ...local]) {
    const key = row.family.trim().toLocaleLowerCase("es");
    const current = map.get(key) || { family: row.family, units: 0, revenue: 0, cost: 0 };
    current.units += Number(row.units); current.revenue += Number(row.revenue); current.cost += Number(row.cost); map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).map((row) => ({ family: row.family, units: row.units.toFixed(3), revenue: row.revenue.toFixed(2), cost: row.cost.toFixed(2), margin: (row.revenue - row.cost).toFixed(2) }));
}

export async function getCombinedReports(input: { period?: string; from?: string; to?: string; source?: "all" | "loyverse" | "local" } = {}) {
  const source = input.source || "all";
  const emptyReport = { period: input.period || "quarter", from: input.from || null, to: input.to || null, totals: { totalSold: "0.00", subtotal: "0.00", vat: "0.00", cash: "0.00", card: "0.00", cost: "0.00", margin: "0.00", tickets: 0 }, series: [], topProducts: [], byFamily: [], vatBreakdown: [] };
  const [{ getReports }, remote] = await Promise.all([import("./pos"), source === "local" ? Promise.resolve(emptyReport) : getLoyverseReports(input)]);
  const local = source === "loyverse" ? emptyReport : await getReports(input);
  return {
    period: remote.period, from: remote.from || local.from, to: remote.to || local.to,
    totals: {
      totalSold: mergeMoney(remote.totals.totalSold, local.totals.totalSold), subtotal: mergeMoney(remote.totals.subtotal, local.totals.subtotal), vat: mergeMoney(remote.totals.vat, local.totals.vat), cash: mergeMoney(remote.totals.cash, local.totals.cash), card: mergeMoney(remote.totals.card, local.totals.card), cost: mergeMoney(remote.totals.cost, local.totals.cost), margin: mergeMoney(remote.totals.margin, local.totals.margin), tickets: remote.totals.tickets + local.totals.tickets,
    },
    series: mergeSeriesRows(remote.series, local.series),
    topProducts: mergeProductRows(remote.topProducts, local.topProducts),
    byFamily: mergeFamilyRows(remote.byFamily, local.byFamily),
    vatBreakdown: [...remote.vatBreakdown, ...local.vatBreakdown],
  };
}

export async function getCombinedSalesByProduct() { return (await getCombinedReports({ period: "year" })).topProducts; }

export async function getCombinedDailyAnalysis() {
  const [{ getDailyAnalysis }, remote] = await Promise.all([import("./pos"), getLoyverseDailyAnalysis()]);
  const local = await getDailyAnalysis();
  return {
    businessDate: local.businessDate, sessionId: local.sessionId, status: local.status,
    totalSold: mergeMoney(remote.totalSold, local.totalSold), cashSold: mergeMoney(remote.cashSold, local.cashSold), cardSold: mergeMoney(remote.cardSold, local.cardSold), expectedCash: mergeMoney(remote.expectedCash, local.expectedCash), tickets: remote.tickets + local.tickets,
    hourly: remote.hourly.map((row, index) => ({ hour: row.hour, label: row.label, total: mergeMoney(row.total, local.hourly[index]?.total || "0"), tickets: row.tickets + (local.hourly[index]?.tickets || 0), cash: mergeMoney(row.cash, local.hourly[index]?.cash || "0"), card: mergeMoney(row.card, local.hourly[index]?.card || "0") })),
    topProducts: mergeProductRows(remote.topProducts.map((row) => ({ ...row, cost: "0", margin: row.revenue })), local.topProducts.map((row) => ({ ...row, cost: "0", margin: row.revenue }))).slice(0, 10).map((row) => ({ productId: row.productId, productName: row.productName, units: row.units, revenue: row.revenue })),
  };
}

export async function getCombinedRecentSales(limit = 100) {
  const [{ getRecentSales }, remote] = await Promise.all([import("./pos"), getLoyverseRecentSales(Math.min(limit * 2, 500))]);
  const local = await getRecentSales(Math.min(limit * 2, 500));
  return [...remote.map((row) => ({ ...row, id: -Math.abs(row.id), source: "loyverse" as const })), ...local.map((row) => ({ ...row, source: "local" as const }))].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
}

export async function getCombinedReceiptDetails(id: number) {
  if (id < 0) return getLoyverseReceiptDetails(Math.abs(id));
  const { getSaleDetails } = await import("./pos");
  return { ...(await getSaleDetails(id)), source: "local" as const };
}
