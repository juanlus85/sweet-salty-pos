import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  cashMovements,
  cashSessions,
  fiscalInvoices,
  fiscalRecords,
  categories,
  inventoryBalances,
  payments,
  posSettings,
  products,
  purchaseInvoiceLines,
  purchaseInvoices,
  saleLines,
  sales,
  stockMovements,
  suppliers,
  vatTypes,
  loyverseCategories,
  loyverseItems,
  loyverseTaxes,
  loyverseVariants,
  loyverseVariantPrices,
  loyverseInventoryLevels,
  loyverseReceiptLines,
  loyverseSyncState,
  promotions,
  promotionSlots,
  promotionSlotProducts,
  openTickets,
} from "../../drizzle/schema";
import { requireDb } from "../db";
import { issueFiscalTestRecord } from "./fiscal";

const toNumber = (value: string | number | null | undefined) => Number(value ?? 0);
const money = (value: number) => value.toFixed(2);
const quantity = (value: number) => value.toFixed(3);
type ProductCostFields = Pick<typeof products.$inferSelect, "weightedAverageCost" | "lastPurchaseCost" | "weightedAverageCostBeforeSurcharge" | "lastPurchaseCostBeforeSurcharge">;
const effectiveProductCost = (product: ProductCostFields) => [product.weightedAverageCost, product.lastPurchaseCost, product.weightedAverageCostBeforeSurcharge, product.lastPurchaseCostBeforeSurcharge].map(toNumber).find((value) => value > 0) ?? 0;

export function getBusinessDate(now = new Date()) {
  const timezone = process.env.BUSINESS_TIMEZONE ?? "Europe/Madrid";
  const localParts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((part) => [part.type, part.value]));
  const localHour = Number(localParts.hour);
  const localClockAsUtc = Date.UTC(Number(localParts.year), Number(localParts.month) - 1, Number(localParts.day), localHour, Number(localParts.minute));
  const businessInstant = new Date(localClockAsUtc - 7 * 60 * 60 * 1000);
  const businessParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(businessInstant).map((part) => [part.type, part.value]));
  return `${businessParts.year}-${businessParts.month}-${businessParts.day}`;
}

export async function listCategories() {
  const database = requireDb();
  const [categoryRows, productCounts] = await Promise.all([
    database.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder), asc(categories.name)),
    database.select({ categoryId: products.categoryId, count: sql<number>`count(*)` }).from(products).where(eq(products.isActive, true)).groupBy(products.categoryId),
  ]);
  const countByCategory = new Map(productCounts.map((row) => [row.categoryId, Number(row.count)]));
  return categoryRows.filter((category) => normalizeCatalogText(category.name) !== "articulos sin asignar" || (countByCategory.get(category.id) ?? 0) > 0);
}

export async function listCatalog(categoryId?: number, order: "alphabetical" | "popular" = "popular") {
  const database = requireDb();
  const orderBy = order === "alphabetical" ? [asc(products.name)] : [desc(products.isFeatured), asc(products.name)];
  const conditions = [eq(products.isActive, true), eq(products.showInTpv, true)];
  if (categoryId) conditions.push(eq(products.categoryId, categoryId));

  const rows = await database
    .select({
      id: products.id,
      categoryId: products.categoryId,
      categoryName: categories.name,
      categoryIsPromotion: categories.isPromotion,
      promotionId: promotions.id,
      vatTypeId: products.vatTypeId,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      imageUrl: products.imageUrl,
      imageZoom: products.imageZoom,
      imagePositionX: products.imagePositionX,
      imagePositionY: products.imagePositionY,
      unit: products.unit,
      salePrice: products.salePrice,
      vatRate: products.vatRate,
      cost: sql<string>`coalesce(nullif(${products.weightedAverageCost}, 0), nullif(${products.lastPurchaseCost}, 0), nullif(${products.weightedAverageCostBeforeSurcharge}, 0), nullif(${products.lastPurchaseCostBeforeSurcharge}, 0), 0)`,
      minimumStock: products.minimumStock,
      isFeatured: products.isFeatured,
      isActive: products.isActive,
      stock: inventoryBalances.quantityOnHand,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(promotions, and(eq(promotions.productId, products.id), eq(promotions.isActive, true)))
    .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
    .where(and(...conditions))
    .orderBy(...orderBy);

  return rows.map((row) => ({ ...row, stock: row.stock ?? "0.000" }));
}

export async function getFeaturedProducts() {
  const database = requireDb();
  const soldUnits = sql<string>`coalesce(sum(case when ${sales.status} = 'completed' then ${saleLines.quantity} else 0 end), 0)`;
  const rows = await database
    .select({
      id: products.id,
      categoryId: products.categoryId,
      categoryName: categories.name,
      categoryIsPromotion: categories.isPromotion,
      promotionId: promotions.id,
      vatTypeId: products.vatTypeId,
      name: products.name,
      sku: products.sku,
      imageUrl: products.imageUrl,
      imageZoom: products.imageZoom,
      imagePositionX: products.imagePositionX,
      imagePositionY: products.imagePositionY,
      unit: products.unit,
      salePrice: products.salePrice,
      vatRate: products.vatRate,
      cost: sql<string>`coalesce(nullif(${products.weightedAverageCost}, 0), nullif(${products.lastPurchaseCost}, 0), nullif(${products.weightedAverageCostBeforeSurcharge}, 0), nullif(${products.lastPurchaseCostBeforeSurcharge}, 0), 0)`,
      stock: inventoryBalances.quantityOnHand,
      isFeatured: products.isFeatured,
      soldUnits,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(promotions, and(eq(promotions.productId, products.id), eq(promotions.isActive, true)))
    .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
    .leftJoin(saleLines, eq(saleLines.productId, products.id))
    .leftJoin(sales, eq(sales.id, saleLines.saleId))
    .where(and(eq(products.isActive, true), eq(products.showInTpv, true)))
    .groupBy(products.id, categories.name, categories.isPromotion, promotions.id, inventoryBalances.quantityOnHand)
    .orderBy(desc(soldUnits), desc(products.isFeatured), asc(products.name))
    .limit(12);
  return rows.map((row) => ({ ...row, stock: row.stock ?? "0.000", soldUnits: row.soldUnits ?? "0" }));
}

export async function createProduct(input: {
  categoryId: number;
  name: string;
  salePrice: number;
  vatRate?: number;
  vatTypeId?: number;
  equivalenceSurchargeRate?: number;
  lastPurchaseCostBeforeSurcharge?: number;
  lastPurchaseCost?: number;
  weightedAverageCostBeforeSurcharge?: number;
  weightedAverageCost?: number;
  showInTpv?: boolean;
  initialStock?: number;
  minimumStock?: number;
  sku?: string;
  barcode?: string;
  imageUrl?: string;
  primarySupplierId?: number;
  imageZoom?: number;
  imagePositionX?: number;
  imagePositionY?: number;
}) {
  const database = requireDb();
  const initialStock = input.initialStock ?? 0;
  const result = await database.transaction(async (tx) => {
    let resolvedVatRate = input.vatRate ?? 10;
    if (input.vatTypeId) {
      const selectedVat = await tx.select({ rate: vatTypes.rate }).from(vatTypes).where(and(eq(vatTypes.id, input.vatTypeId), eq(vatTypes.isActive, true))).limit(1);
      if (!selectedVat[0]) throw new Error("El tipo de IVA seleccionado no existe o está inactivo.");
      resolvedVatRate = toNumber(selectedVat[0].rate);
    }
    const inserted = await tx.insert(products).values({
      categoryId: input.categoryId,
      vatTypeId: input.vatTypeId ?? null,
      name: input.name.trim(),
      salePrice: money(input.salePrice),
      vatRate: money(resolvedVatRate),
      equivalenceSurchargeRate: money(input.equivalenceSurchargeRate ?? (resolvedVatRate === 10 ? 1.4 : resolvedVatRate === 21 ? 5.2 : 0)),
      lastPurchaseCostBeforeSurcharge: money(input.lastPurchaseCostBeforeSurcharge ?? 0),
      lastPurchaseCost: money(input.lastPurchaseCost ?? input.lastPurchaseCostBeforeSurcharge ?? 0),
      weightedAverageCostBeforeSurcharge: money(input.weightedAverageCostBeforeSurcharge ?? 0),
      weightedAverageCost: money(input.weightedAverageCost ?? input.weightedAverageCostBeforeSurcharge ?? 0),
      showInTpv: input.showInTpv ?? true,
      minimumStock: quantity(input.minimumStock ?? 0),
      sku: input.sku?.trim() || null,
      barcode: input.barcode?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      imageZoom: money(Math.min(3, Math.max(0.5, input.imageZoom ?? 1))),
      imagePositionX: money(Math.min(100, Math.max(0, input.imagePositionX ?? 50))),
      imagePositionY: money(Math.min(100, Math.max(0, input.imagePositionY ?? 50))),
      primarySupplierId: input.primarySupplierId ?? null,
    });
    const productId = Number(inserted[0].insertId);
    await tx.insert(inventoryBalances).values({ productId, quantityOnHand: quantity(initialStock) });
    if (initialStock !== 0) {
      await tx.insert(stockMovements).values({
        productId,
        movementType: "opening",
        quantityDelta: quantity(initialStock),
        quantityBefore: "0.000",
        quantityAfter: quantity(initialStock),
        sourceType: "product",
        sourceId: productId,
        note: "Stock inicial al crear el artículo",
      });
    }
    return productId;
  });
  return { id: result };
}

export async function getOrCreateCashSession(businessDate = getBusinessDate()) {
  const database = requireDb();
  const existing = await database
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.businessDate, businessDate))
    .limit(1);
  if (existing[0]) return existing[0];

  const previous = await database
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.status, "closed"))
    .orderBy(desc(cashSessions.businessDate))
    .limit(1);
  const openingFloat = toNumber(previous[0]?.countedCash ?? 0);

  await database.insert(cashSessions).values({ businessDate, openingFloat: money(openingFloat) });
  const created = await database
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.businessDate, businessDate))
    .limit(1);
  if (!created[0]) throw new Error("No se pudo abrir la caja diaria.");

  if (openingFloat > 0) {
    await database.insert(cashMovements).values({
      cashSessionId: created[0].id,
      movementType: "float",
      amount: money(openingFloat),
      note: "Cambio inicial arrastrado del cierre anterior",
    });
  }
  return created[0];
}

export type CheckoutInput = {
  lines: Array<{ productId: number; quantity: number; unitPrice?: number; discountPercent?: number; pricingMode?: "normal" | "discount" | "cost" | "free" | "promotion"; promotionId?: number; promotionSelections?: number[] }>;
  paymentMethod: "cash" | "card";
  receivedAmount?: number;
  terminalReference?: string;
  note?: string;
};

type OpenTicketCart = unknown[];

function assertOpenTicketSlot(slotNumber: number) {
  if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > 10) throw new Error("La posición del ticket debe estar entre 1 y 10.");
}

export async function listOpenTickets() {
  const database = requireDb();
  return database.select({ slotNumber: openTickets.slotNumber, cart: openTickets.cart, savedAt: openTickets.savedAt }).from(openTickets).orderBy(asc(openTickets.slotNumber));
}

export async function saveOpenTicket(input: { slotNumber: number; cart: OpenTicketCart }) {
  assertOpenTicketSlot(input.slotNumber);
  if (!Array.isArray(input.cart) || input.cart.length === 0) throw new Error("No se puede guardar un ticket vacío.");
  const database = requireDb();
  await database.insert(openTickets).values({ slotNumber: input.slotNumber, cart: input.cart }).onDuplicateKeyUpdate({ set: { cart: input.cart, savedAt: new Date() } });
  const saved = await database.select({ slotNumber: openTickets.slotNumber, cart: openTickets.cart, savedAt: openTickets.savedAt }).from(openTickets).where(eq(openTickets.slotNumber, input.slotNumber)).limit(1);
  return saved[0];
}

export async function clearOpenTicket(slotNumber: number) {
  assertOpenTicketSlot(slotNumber);
  const database = requireDb();
  await database.delete(openTickets).where(eq(openTickets.slotNumber, slotNumber));
  return { success: true };
}

export async function checkout(input: CheckoutInput) {
  const database = requireDb();
  const groupedLines = new Map<number, number>();
  const lineInputs = new Map<number, CheckoutInput["lines"][number]>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.productId) || !Number.isInteger(line.quantity) || line.quantity < 0 || (line.unitPrice !== undefined && (!Number.isFinite(line.unitPrice) || line.unitPrice < 0)) || (line.discountPercent !== undefined && (!Number.isFinite(line.discountPercent) || line.discountPercent < 0 || line.discountPercent > 100))) {
      throw new Error("El ticket contiene una línea inválida.");
    }
    if (line.quantity === 0) continue;
    if (line.promotionId) {
      if (!line.promotionSelections?.length) throw new Error("La promoción necesita seleccionar todos sus artículos.");
      continue;
    }
    groupedLines.set(line.productId, (groupedLines.get(line.productId) ?? 0) + line.quantity);
    lineInputs.set(line.productId, line);
  }
  const promotionInputs = input.lines.filter((line) => line.promotionId && line.quantity > 0);
  if (groupedLines.size === 0 && promotionInputs.length === 0) throw new Error("El ticket está vacío.");

  const activeSession = await getOrCreateCashSession();
  return database.transaction(async (tx) => {
    const session = await tx.select().from(cashSessions).where(eq(cashSessions.id, activeSession.id)).limit(1);
    const cashSession = session[0];
    if (!cashSession || cashSession.status !== "open") throw new Error("La caja de esta jornada ya está cerrada. La siguiente se abrirá automáticamente a las 07:00.");

    const normalProductIds = [...groupedLines.keys()];
    const promotionIds = promotionInputs.map((line) => line.promotionId!).filter((id, index, list) => list.indexOf(id) === index);
    const promotionRows = promotionIds.length ? await tx.select().from(promotions).where(and(inArray(promotions.id, promotionIds), eq(promotions.isActive, true))) : [];
    if (promotionRows.length !== promotionIds.length) throw new Error("Una de las promociones ya no está activa.");
    const promotionSlotRows = promotionIds.length ? await tx.select().from(promotionSlots).where(inArray(promotionSlots.promotionId, promotionIds)).orderBy(asc(promotionSlots.position)) : [];
    const selectedComponentIds = promotionInputs.flatMap((line) => line.promotionSelections ?? []);
    const componentProductIds = [...new Set(selectedComponentIds)];
    const promotionProductIds = [...new Set(promotionInputs.map((line) => line.productId))];
    const productIds = [...new Set([...normalProductIds, ...componentProductIds, ...promotionProductIds])];
    const catalogRows = productIds.length ? await tx.select({ product: products, balance: inventoryBalances }).from(products).leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id)).where(and(inArray(products.id, productIds), eq(products.isActive, true))) : [];
    if (catalogRows.length !== productIds.length) throw new Error("Uno o varios productos ya no están disponibles.");
    const catalogById = new Map(catalogRows.map(({ product, balance }) => [product.id, { product, balance }]));

    type ComputedLine = { product: typeof products.$inferSelect; currentStock: number; soldQuantity: number; unitPrice: number; baseUnitPrice: number; discountPercent: number; pricingMode: string; unitCost: number; vatRate: number; lineTotal: number; lineVat: number; lineSubtotal: number; promotionId?: number; promotionSlotId?: number };
    const computedLines: ComputedLine[] = [];
    const stockRequirements = new Map<number, number>();
    for (const line of input.lines) {
      if (line.promotionId) {
        const promotion = promotionRows.find((row) => row.id === line.promotionId)!;
        const slots = promotionSlotRows.filter((slot) => slot.promotionId === promotion.id).sort((a, b) => a.position - b.position);
        const selections = line.promotionSelections ?? [];
        if (selections.length !== slots.length || selections.some((productId, index) => !slots[index])) throw new Error(`La promoción ${promotion.name} necesita ${slots.length} artículos.`);
        for (let index = 0; index < slots.length; index += 1) {
          const slot = slots[index];
          const allowed = await tx.select({ productId: promotionSlotProducts.productId }).from(promotionSlotProducts).where(and(eq(promotionSlotProducts.slotId, slot.id), eq(promotionSlotProducts.productId, selections[index]))).limit(1);
          if (!allowed[0]) throw new Error(`El artículo seleccionado no está permitido para «${slot.label}».`);
          const selected = catalogById.get(selections[index]);
          if (!selected) throw new Error("Uno de los artículos de la promoción no está disponible.");
          const product = selected.product;
          const quantityValue = line.quantity;
          const currentStock = toNumber(selected.balance?.quantityOnHand);
          const unitCost = effectiveProductCost(product);
          stockRequirements.set(product.id, (stockRequirements.get(product.id) ?? 0) + quantityValue);
          computedLines.push({ product, currentStock, soldQuantity: quantityValue, unitPrice: 0, baseUnitPrice: 0, discountPercent: 0, pricingMode: "promotion_component", unitCost, vatRate: toNumber(product.vatRate), lineTotal: 0, lineVat: 0, lineSubtotal: 0, promotionId: promotion.id, promotionSlotId: slot.id });
        }
        const promoProduct = catalogRows.find(({ product }) => product.id === line.productId)?.product ?? catalogById.get(line.productId)?.product;
        if (!promoProduct) throw new Error("No se encontró el artículo de la promoción.");
        const comboPrice = toNumber(promotion.comboPrice);
        const comboVatRate = toNumber(promoProduct.vatRate);
        const comboVat = comboPrice * comboVatRate / (100 + comboVatRate);
        computedLines.push({ product: promoProduct, currentStock: toNumber(catalogById.get(promoProduct.id)?.balance?.quantityOnHand), soldQuantity: line.quantity, unitPrice: comboPrice, baseUnitPrice: comboPrice, discountPercent: 0, pricingMode: "promotion", unitCost: 0, vatRate: comboVatRate, lineTotal: comboPrice * line.quantity, lineVat: comboVat * line.quantity, lineSubtotal: (comboPrice - comboVat) * line.quantity, promotionId: promotion.id });
        continue;
      }
      const selected = catalogById.get(line.productId)!;
      const product = selected.product;
      const soldQuantity = groupedLines.get(product.id) ?? 0;
      const currentStock = toNumber(selected.balance?.quantityOnHand);
      const lineInput = lineInputs.get(product.id);
      const pricingMode = lineInput?.pricingMode ?? "normal";
      const unitCost = effectiveProductCost(product);
      const baseUnitPrice = pricingMode === "cost" ? unitCost : toNumber(lineInput?.unitPrice ?? product.salePrice);
      const discountPercent = pricingMode === "free" ? 100 : Math.min(100, Math.max(0, toNumber(lineInput?.discountPercent)));
      const unitPrice = baseUnitPrice * (1 - discountPercent / 100);
      const vatRate = toNumber(product.vatRate);
      const lineTotal = unitPrice * soldQuantity;
      const lineVat = lineTotal * (vatRate / (100 + vatRate));
      stockRequirements.set(product.id, (stockRequirements.get(product.id) ?? 0) + soldQuantity);
      computedLines.push({ product, currentStock, soldQuantity, unitPrice, baseUnitPrice, discountPercent, pricingMode, unitCost, vatRate, lineTotal, lineVat, lineSubtotal: lineTotal - lineVat });
    }

    for (const [productId, required] of stockRequirements) {
      const currentStock = toNumber(catalogById.get(productId)?.balance?.quantityOnHand);
      if (currentStock < 0) throw new Error("Stock inválido.");
      if (required > currentStock && currentStock > 0) throw new Error(`Stock insuficiente para ${catalogById.get(productId)?.product.name ?? "un artículo"}.`);
    }
    const subtotal = computedLines.reduce((sum, line) => sum + line.lineSubtotal, 0);
    const vatAmount = computedLines.reduce((sum, line) => sum + line.lineVat, 0);
    const totalAmount = computedLines.reduce((sum, line) => sum + line.lineTotal, 0);
    const discountAmount = Math.max(0, computedLines.reduce((sum, line) => sum + ((line.baseUnitPrice - line.unitPrice) * line.soldQuantity), 0));
    const receivedAmount = input.paymentMethod === "cash" ? (input.receivedAmount ?? totalAmount) : totalAmount;
    if (receivedAmount < totalAmount) throw new Error("El importe recibido es menor que el total del ticket.");
    const changeAmount = input.paymentMethod === "cash" ? receivedAmount - totalAmount : 0;
    const issuedAt = new Date();
    const saleNumber = `SS-${cashSession.businessDate.replaceAll("-", "")}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;
    const insertedSale = await tx.insert(sales).values({ saleNumber, cashSessionId: cashSession.id, subtotal: money(subtotal), discountAmount: money(discountAmount), vatAmount: money(vatAmount), totalAmount: money(totalAmount), note: input.note?.trim() || null, createdAt: issuedAt });
    const saleId = Number(insertedSale[0].insertId);
    for (const line of computedLines) {
      await tx.insert(saleLines).values({ saleId, productId: line.product.id, productName: line.pricingMode === "promotion_component" ? `↳ ${line.product.name}` : line.product.name, sku: line.product.sku, quantity: quantity(line.soldQuantity), unitPrice: money(line.unitPrice), unitCost: money(line.unitCost), vatRate: money(line.vatRate), lineSubtotal: money(line.lineSubtotal), lineVat: money(line.lineVat), lineTotal: money(line.lineTotal), discountPercent: money(line.discountPercent), pricingMode: line.pricingMode, promotionId: line.promotionId ?? null, promotionSlotId: line.promotionSlotId ?? null });
    }
    for (const [productId, required] of stockRequirements) {
      const selected = catalogById.get(productId)!;
      const stockBefore = toNumber(selected.balance?.quantityOnHand);
      const quantityAfter = stockBefore - required;
      if (selected.balance) await tx.update(inventoryBalances).set({ quantityOnHand: quantity(quantityAfter) }).where(eq(inventoryBalances.productId, productId));
      else await tx.insert(inventoryBalances).values({ productId, quantityOnHand: quantity(quantityAfter) });
      await tx.insert(stockMovements).values({ productId, movementType: "sale", quantityDelta: quantity(-required), quantityBefore: quantity(stockBefore), quantityAfter: quantity(quantityAfter), unitCost: money(effectiveProductCost(selected.product)), sourceType: "sale", sourceId: saleId, note: `Venta ${saleNumber}` });
    }
    await tx.insert(payments).values({ saleId, method: input.paymentMethod, amount: money(totalAmount), receivedAmount: money(receivedAmount), changeAmount: money(changeAmount), terminalReference: input.paymentMethod === "card" ? input.terminalReference?.trim() || null : null });
    if (input.paymentMethod === "cash") await tx.insert(cashMovements).values({ cashSessionId: cashSession.id, movementType: "cash_sale", amount: money(totalAmount), sourceType: "sale", sourceId: saleId, note: `Venta ${saleNumber}` });
    else await tx.update(cashSessions).set({ cardTotal: money(toNumber(cashSession.cardTotal) + totalAmount) }).where(eq(cashSessions.id, cashSession.id));
    const fiscal = await issueFiscalTestRecord(tx, { saleId, issuedAt, subtotal, vatAmount, totalAmount, paymentMethod: input.paymentMethod, lines: computedLines.map((line) => ({ productName: line.product.name, sku: line.product.sku, quantity: line.soldQuantity, unitPrice: line.unitPrice, vatRate: line.vatRate, lineSubtotal: line.lineSubtotal, lineVat: line.lineVat, lineTotal: line.lineTotal })) });
    return { saleId, saleNumber, fiscalInvoiceNumber: fiscal.fiscalInvoice.invoiceNumber, subtotal: money(subtotal), vatAmount: money(vatAmount), totalAmount: money(totalAmount), changeAmount: money(changeAmount), paymentMethod: input.paymentMethod, createdAt: new Date().toISOString() };
  });
}
export async function getCurrentCashSummary() {
  const database = requireDb();
  const session = await getOrCreateCashSession();
  const result = await database
    .select({ total: sql<string>`coalesce(sum(${cashMovements.amount}), 0)` })
    .from(cashMovements)
    .where(and(eq(cashMovements.cashSessionId, session.id), sql`${cashMovements.movementType} <> 'float'`));
  const soldResult = await database
    .select({ totalSold: sql<string>`coalesce(sum(${sales.totalAmount}), 0)` })
    .from(sales)
    .where(and(eq(sales.cashSessionId, session.id), eq(sales.status, "completed")));
  const expectedCash = toNumber(session.openingFloat) + toNumber(result[0]?.total);
  return { ...session, expectedCash: money(expectedCash), totalSold: money(toNumber(soldResult[0]?.totalSold)), businessTimezone: process.env.BUSINESS_TIMEZONE ?? "Europe/Madrid", businessDayStartsAt: "07:00" };
}

const CASH_DENOMINATIONS = [0.10, 0.20, 0.50, 1, 2, 5, 10, 20, 50] as const;

export async function closeCurrentCashSession(input: { countedCash?: number; countedCard?: number; denominationCounts?: Record<string, number>; notes?: string }) {
  const database = requireDb();
  const summary = await getCurrentCashSummary();
  if (summary.status !== "open") throw new Error("La caja de hoy ya está cerrada.");
  const counts = input.denominationCounts ?? {};
  const hasDenominations = Object.keys(counts).length > 0;
  const countedCash = hasDenominations ? CASH_DENOMINATIONS.reduce((sum, denomination) => sum + denomination * Math.max(0, Number(counts[denomination.toFixed(2)] ?? 0)), 0) : Math.max(0, input.countedCash ?? 0);
  const countedCard = Math.max(0, input.countedCard ?? toNumber(summary.cardTotal));
  const cashDifference = countedCash - toNumber(summary.expectedCash);
  const cardDifference = countedCard - toNumber(summary.cardTotal);
  const difference = cashDifference + cardDifference;
  await database
    .update(cashSessions)
    .set({
      countedCash: money(countedCash),
      countedCard: money(countedCard),
      denominationCounts: hasDenominations ? counts : null,
      expectedCash: summary.expectedCash,
      difference: money(difference),
      status: "closed",
      closedAt: new Date(),
      notes: input.notes?.trim() || null,
    })
    .where(eq(cashSessions.id, summary.id));

  // Preparar la próxima jornada: el siguiente primer acceso encontrará la caja ya abierta.
  const nextBusinessDate = new Date(`${summary.businessDate}T00:00:00Z`);
  nextBusinessDate.setUTCDate(nextBusinessDate.getUTCDate() + 1);
  const nextDate = nextBusinessDate.toISOString().slice(0, 10);
  const nextSession = await database.select().from(cashSessions).where(eq(cashSessions.businessDate, nextDate)).limit(1);
  if (!nextSession[0]) {
    const insertedNext = await database.insert(cashSessions).values({ businessDate: nextDate, openingFloat: money(countedCash) });
    const nextId = Number(insertedNext[0].insertId);
    if (countedCash > 0) await database.insert(cashMovements).values({ cashSessionId: nextId, movementType: "float", amount: money(countedCash), note: "Fondo inicial preparado desde el cierre anterior" });
  }
  return { ...summary, countedCash: money(countedCash), countedCard: money(countedCard), cashDifference: money(cashDifference), cardDifference: money(cardDifference), difference: money(difference), status: "closed" as const };
}

export async function getRecentSales(limit = 20) {
  const database = requireDb();
  return database
    .select({
      id: sales.id,
      saleNumber: sales.saleNumber,
      totalAmount: sales.totalAmount,
      status: sales.status,
      createdAt: sales.createdAt,
      method: payments.method,
      changeAmount: payments.changeAmount,
    })
    .from(sales)
    .leftJoin(payments, eq(payments.saleId, sales.id))
    .orderBy(desc(sales.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}


export async function listVatTypes() {
  const database = requireDb();
  return database.select().from(vatTypes).where(eq(vatTypes.isActive, true)).orderBy(asc(vatTypes.sortOrder), asc(vatTypes.rate));
}

export async function repairImportedVatRates() {
  const database = requireDb();
  const settings = await database.select().from(posSettings).limit(1);
  const configuredRate = toNumber(settings[0]?.defaultVatRate ?? 10);
  const targetRate = [0, 4, 10, 21].includes(configuredRate) ? configuredRate : 10;
  const targetVat = await database.select({ id: vatTypes.id }).from(vatTypes).where(and(eq(vatTypes.isActive, true), eq(vatTypes.rate, money(targetRate)))).limit(1);
  const result = await database.update(products).set({ vatTypeId: targetVat[0]?.id ?? null, vatRate: money(targetRate), equivalenceSurchargeRate: money(targetRate === 10 ? 1.4 : targetRate === 21 ? 5.2 : 0) }).where(and(isNotNull(products.loyverseVariantId), eq(products.vatRate, "7.00")));
  const header = result[0] as { affectedRows?: number } | undefined;
  return { success: true, corrected: Number(header?.affectedRows ?? 0), vatRate: targetRate, vatTypeId: targetVat[0]?.id ?? null, historicalRecordsChanged: false };
}

export async function createVatType(input: { name: string; rate: number; sortOrder?: number }) {
  const database = requireDb();
  const inserted = await database.insert(vatTypes).values({ name: input.name.trim(), rate: money(input.rate), sortOrder: input.sortOrder ?? 0 });
  return { id: Number(inserted[0].insertId) };
}

export async function updateVatType(input: { id: number; name?: string; rate?: number; sortOrder?: number; isActive?: boolean }) {
  const database = requireDb();
  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name.trim();
  if (input.rate !== undefined) values.rate = money(input.rate);
  if (input.sortOrder !== undefined) values.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) values.isActive = input.isActive;
  if (Object.keys(values).length) await database.update(vatTypes).set(values).where(eq(vatTypes.id, input.id));
  return { success: true };
}

export async function listAdminProducts() {
  const database = requireDb();
  return database
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      categoryId: products.categoryId,
      categoryName: categories.name,
      vatTypeId: products.vatTypeId,
      salePrice: products.salePrice,
      vatRate: products.vatRate,
      lastPurchaseCost: products.lastPurchaseCost,
      weightedAverageCost: products.weightedAverageCost,
      lastPurchaseCostBeforeSurcharge: products.lastPurchaseCostBeforeSurcharge,
      weightedAverageCostBeforeSurcharge: products.weightedAverageCostBeforeSurcharge,
      cost: sql<string>`coalesce(nullif(${products.weightedAverageCost}, 0), nullif(${products.lastPurchaseCost}, 0), nullif(${products.weightedAverageCostBeforeSurcharge}, 0), nullif(${products.lastPurchaseCostBeforeSurcharge}, 0), 0)`,
      imageZoom: products.imageZoom,
      imagePositionX: products.imagePositionX,
      imagePositionY: products.imagePositionY,
      minimumStock: products.minimumStock,
      isFeatured: products.isFeatured,
      showInTpv: products.showInTpv,
      imageUrl: products.imageUrl,
      stock: inventoryBalances.quantityOnHand,
      isActive: products.isActive,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
    .where(eq(products.isActive, true))
    .orderBy(asc(products.name));
}

export async function listAdminCategories() {
  const database = requireDb();
  return database.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder), asc(categories.name));
}

function rethrowSmtpSchemaError(error: unknown): never {
  if (error instanceof Error && /Unknown column.*smtp_(host|port|secure|user|password|from)/i.test(error.message)) {
    throw new Error("La base de datos aún no tiene la migración SMTP 0009. Ejecuta deploy/0009_smtp_idempotent.sql en la base de datos de producción y reinicia la aplicación.");
  }
  throw error;
}

export type SmtpConfig = {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string | null;
  source: "database" | "environment" | "none";
};

export async function getSmtpConfig(): Promise<SmtpConfig> {
  const database = requireDb();
  let rows;
  try {
    rows = await database.select().from(posSettings).limit(1);
  } catch (error) {
    rethrowSmtpSchemaError(error);
  }
  const stored = rows[0];
  const hasStoredConfig = Boolean(stored?.smtpHost || stored?.smtpUser || stored?.smtpPassword || stored?.smtpFrom);
  if (hasStoredConfig) {
    return {
      host: stored?.smtpHost?.trim() || null,
      port: stored?.smtpPort ?? 587,
      secure: stored?.smtpSecure ?? false,
      user: stored?.smtpUser?.trim() || null,
      password: stored?.smtpPassword || null,
      from: stored?.smtpFrom?.trim() || null,
      source: "database",
    };
  }
  const host = process.env.SMTP_HOST?.trim() || null;
  const user = process.env.SMTP_USER?.trim() || null;
  const password = process.env.SMTP_PASSWORD?.trim() || null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true",
    user,
    password,
    from: process.env.SMTP_FROM?.trim() || null,
    source: host || user || password ? "environment" : "none",
  };
}

export async function getPosSettings() {
  const database = requireDb();
  let rows;
  try {
    rows = await database.select().from(posSettings).limit(1);
  } catch (error) {
    rethrowSmtpSchemaError(error);
  }
  const settings = rows[0];
  const smtp = await getSmtpConfig();
  return {
    businessName: settings?.businessName ?? "Sweet & Salty",
    currency: settings?.currency ?? "EUR",
    timezone: settings?.timezone ?? "Europe/Madrid",
    businessDayStartsAt: settings?.businessDayStartsAt ?? "07:00",
    defaultVatRate: settings?.defaultVatRate ?? "10.00",
    smtpHost: settings?.smtpHost ?? (smtp.source === "environment" ? smtp.host : null),
    smtpPort: settings?.smtpPort ?? smtp.port,
    smtpSecure: settings?.smtpSecure ?? smtp.secure,
    smtpUser: settings?.smtpUser ?? (smtp.source === "environment" ? smtp.user : null),
    smtpFrom: settings?.smtpFrom ?? (smtp.source === "environment" ? smtp.from : null),
    smtpPasswordConfigured: Boolean(smtp.password),
    smtpSource: smtp.source,
    loyverseApiBaseUrl: settings?.loyverseApiBaseUrl ?? process.env.LOYVERSE_API_BASE_URL ?? "https://api.loyverse.com/v1.0",
    loyverseStoreId: settings?.loyverseStoreId ?? process.env.LOYVERSE_STORE_ID ?? null,
    loyverseTokenConfigured: Boolean(settings?.loyverseApiToken || process.env.LOYVERSE_API_TOKEN),
    loyverseTokenSource: settings?.loyverseApiToken ? "database" : process.env.LOYVERSE_API_TOKEN ? "environment" : "none",
  };
}

export async function updateLoyverseSettings(input: { apiBaseUrl?: string | null; apiToken?: string; clearToken?: boolean; storeId?: string | null }) {
  const database = requireDb();
  const current = await database.select().from(posSettings).limit(1);
  const values: Partial<typeof posSettings.$inferInsert> = {};
  if (input.apiBaseUrl !== undefined) values.loyverseApiBaseUrl = input.apiBaseUrl?.trim() || null;
  if (input.storeId !== undefined) values.loyverseStoreId = input.storeId?.trim() || null;
  if (input.clearToken) values.loyverseApiToken = null;
  else if (input.apiToken !== undefined) values.loyverseApiToken = input.apiToken.trim() || null;
  if (!current[0]) await database.insert(posSettings).values(values);
  else if (Object.keys(values).length > 0) await database.update(posSettings).set(values).where(eq(posSettings.id, current[0].id));
  return getPosSettings();
}

export async function updateSmtpSettings(input: { smtpHost?: string | null; smtpPort?: number; smtpSecure?: boolean; smtpUser?: string | null; smtpPassword?: string; clearPassword?: boolean; smtpFrom?: string | null }) {
  const database = requireDb();
  let current;
  try {
    current = await database.select().from(posSettings).limit(1);
  } catch (error) {
    rethrowSmtpSchemaError(error);
  }
  const values: Partial<typeof posSettings.$inferInsert> = {};
  if (input.smtpHost !== undefined) values.smtpHost = input.smtpHost?.trim() || null;
  if (input.smtpPort !== undefined) values.smtpPort = input.smtpPort;
  if (input.smtpSecure !== undefined) values.smtpSecure = input.smtpSecure;
  if (input.smtpUser !== undefined) values.smtpUser = input.smtpUser?.trim() || null;
  if (input.clearPassword) values.smtpPassword = null;
  else if (input.smtpPassword !== undefined) values.smtpPassword = input.smtpPassword.trim() || null;
  if (input.smtpFrom !== undefined) values.smtpFrom = input.smtpFrom?.trim() || null;
  if (!current[0]) {
    await database.insert(posSettings).values(values);
  } else if (Object.keys(values).length > 0) {
    await database.update(posSettings).set(values).where(eq(posSettings.id, current[0].id));
  }
  return getPosSettings();
}

export async function createCategory(input: { name: string; color?: string; imageUrl?: string; iconName?: string; sortOrder?: number; isFeatured?: boolean; isPromotion?: boolean; parentCategoryId?: number | null }) {
  const database = requireDb();
  if (input.parentCategoryId !== undefined && input.parentCategoryId !== null) {
    const parent = await database.select({ id: categories.id, parentCategoryId: categories.parentCategoryId, isPromotion: categories.isPromotion, isActive: categories.isActive }).from(categories).where(eq(categories.id, input.parentCategoryId)).limit(1);
    if (!parent[0] || parent[0].isActive === false) throw new Error("La familia padre no existe o está inactiva.");
    if (parent[0].parentCategoryId !== null) throw new Error("Solo se permite un nivel de subfamilias.");
    if (parent[0].isPromotion) throw new Error("Una familia de promociones no puede ser padre de subfamilias.");
    if (input.isPromotion) throw new Error("Una familia de promociones no puede tener una familia padre.");
  }
  const lastOrder = await database.select({ maxOrder: sql<number>`coalesce(max(${categories.sortOrder}), -1)` }).from(categories);
  const inserted = await database.insert(categories).values({
    name: input.name.trim(),
    color: input.color ?? "#155E75",
    imageUrl: input.imageUrl?.trim() || null,
    iconName: input.iconName?.trim() || "Package",
    sortOrder: input.sortOrder ?? Number(lastOrder[0]?.maxOrder ?? -1) + 1,
    isFeatured: input.isFeatured ?? false,
    isPromotion: input.isPromotion ?? false,
    parentCategoryId: input.parentCategoryId ?? null,
  });
  return { id: Number(inserted[0].insertId) };
}

export async function updateCategory(input: { id: number; name?: string; color?: string; imageUrl?: string | null; iconName?: string; sortOrder?: number; isFeatured?: boolean; isPromotion?: boolean; isActive?: boolean; parentCategoryId?: number | null }) {
  const database = requireDb();
  if (input.parentCategoryId !== undefined && input.parentCategoryId !== null) {
    if (input.parentCategoryId === input.id) throw new Error("Una familia no puede ser su propia familia padre.");
    const parent = await database.select({ id: categories.id, parentCategoryId: categories.parentCategoryId, isPromotion: categories.isPromotion, isActive: categories.isActive }).from(categories).where(eq(categories.id, input.parentCategoryId)).limit(1);
    if (!parent[0] || parent[0].isActive === false) throw new Error("La familia padre no existe o está inactiva.");
    if (parent[0].parentCategoryId !== null) throw new Error("Solo se permite un nivel de subfamilias.");
    if (parent[0].isPromotion) throw new Error("Una familia de promociones no puede ser padre de subfamilias.");
  }
  if (input.isPromotion && input.parentCategoryId !== null) throw new Error("Una familia de promociones no puede tener una familia padre.");
  const updateSet: Partial<typeof categories.$inferInsert> = {};
  if (input.name !== undefined) updateSet.name = input.name.trim();
  if (input.color !== undefined) updateSet.color = input.color;
  if (input.imageUrl !== undefined) updateSet.imageUrl = input.imageUrl?.trim() || null;
  if (input.iconName !== undefined) updateSet.iconName = input.iconName.trim() || "Package";
  if (input.sortOrder !== undefined) updateSet.sortOrder = input.sortOrder;
  if (input.isFeatured !== undefined) updateSet.isFeatured = input.isFeatured;
  if (input.isPromotion !== undefined) updateSet.isPromotion = input.isPromotion;
  if (input.parentCategoryId !== undefined) updateSet.parentCategoryId = input.parentCategoryId;
  if (input.isActive !== undefined) updateSet.isActive = input.isActive;
  if (input.isActive === false) {
    await database.transaction(async (tx) => {
      await tx.update(categories).set({ isActive: false }).where(eq(categories.id, input.id));
      await tx.update(products).set({ isActive: false }).where(and(eq(products.categoryId, input.id), eq(products.isActive, true)));
    });
    delete updateSet.isActive;
  }
  if (Object.keys(updateSet).length > 0) await database.update(categories).set(updateSet).where(eq(categories.id, input.id));
  return { success: true };
}

async function ensurePromotionSchema() {
  const database = requireDb();
  await database.execute(sql`CREATE TABLE IF NOT EXISTS pos_promotions (
    id INT AUTO_INCREMENT NOT NULL,
    product_id INT NOT NULL,
    name VARCHAR(160) NOT NULL,
    combo_price DECIMAL(12,2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY pos_promotions_product_unique (product_id)
  )`);
  await database.execute(sql`CREATE TABLE IF NOT EXISTS pos_promotion_slots (
    id INT AUTO_INCREMENT NOT NULL,
    promotion_id INT NOT NULL,
    position INT NOT NULL,
    label VARCHAR(100) NOT NULL,
    category_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY pos_promotion_slots_position_unique (promotion_id, position)
  )`);
  await database.execute(sql`CREATE TABLE IF NOT EXISTS pos_promotion_slot_products (
    id INT AUTO_INCREMENT NOT NULL,
    slot_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY pos_promotion_slot_products_unique (slot_id, product_id)
  )`);
}

export async function listPromotions() {
  await ensurePromotionSchema();
  const database = requireDb();
  const rows = await database.select({ promotion: promotions, productName: products.name, categoryId: products.categoryId, categoryName: categories.name }).from(promotions).innerJoin(products, eq(products.id, promotions.productId)).innerJoin(categories, eq(categories.id, products.categoryId)).orderBy(asc(promotions.name));
  const slotRows = rows.length ? await database.select().from(promotionSlots).where(inArray(promotionSlots.promotionId, rows.map((row) => row.promotion.id))).orderBy(asc(promotionSlots.position)) : [];
  const slotProductRows = slotRows.length ? await database.select({ slotId: promotionSlotProducts.slotId, productId: promotionSlotProducts.productId, productName: products.name }).from(promotionSlotProducts).innerJoin(products, eq(products.id, promotionSlotProducts.productId)).where(inArray(promotionSlotProducts.slotId, slotRows.map((slot) => slot.id))).orderBy(asc(products.name)) : [];
  return rows.map((row) => ({ ...row.promotion, productName: row.productName, categoryId: row.categoryId, categoryName: row.categoryName, slots: slotRows.filter((slot) => slot.promotionId === row.promotion.id).map((slot) => ({ ...slot, products: slotProductRows.filter((product) => product.slotId === slot.id) })) }));
}

export async function createPromotion(input: { productId: number; name: string; comboPrice: number; slots: Array<{ label: string; categoryId: number; productIds: number[] }> }) {
  await ensurePromotionSchema();
  const database = requireDb();
  if (input.slots.length < 1 || input.slots.length > 3) throw new Error("Una promoción debe tener entre 1 y 3 familias.");
  const promotionProduct = await database.select().from(products).innerJoin(categories, eq(categories.id, products.categoryId)).where(and(eq(products.id, input.productId), eq(categories.isPromotion, true))).limit(1);
  if (!promotionProduct[0]) throw new Error("El artículo de la promoción debe pertenecer a una familia marcada como Promociones.");
  const categoryIds = [...new Set(input.slots.map((slot) => slot.categoryId))];
  const categoryRows = await database.select().from(categories).where(and(inArray(categories.id, categoryIds), eq(categories.isActive, true)));
  if (categoryRows.length !== categoryIds.length) throw new Error("Una familia de la promoción no existe o está inactiva.");
  const activeCategoryRows = await database.select({ id: categories.id, parentCategoryId: categories.parentCategoryId }).from(categories).where(eq(categories.isActive, true));
  const allowedCategoryIdsByParent = new Map<number, Set<number>>();
  for (const slot of input.slots) {
    const allowed = new Set<number>([slot.categoryId]);
    for (const category of activeCategoryRows) if (category.parentCategoryId === slot.categoryId) allowed.add(category.id);
    allowedCategoryIdsByParent.set(slot.categoryId, allowed);
  }
  const productIds = [...new Set(input.slots.flatMap((slot) => slot.productIds))];
  if (productIds.length === 0 || productIds.length > 100) throw new Error("Selecciona al menos un artículo permitido.");
  const productRows = await database.select({ id: products.id, categoryId: products.categoryId, isActive: products.isActive }).from(products).where(and(inArray(products.id, productIds), eq(products.isActive, true)));
  if (productRows.length !== productIds.length) throw new Error("Uno de los artículos permitidos no existe o está inactivo.");
  for (const slot of input.slots) {
    if (!slot.label.trim() || slot.productIds.length === 0) throw new Error("Cada familia debe tener una etiqueta y al menos un artículo permitido.");
    const allowedCategoryIds = allowedCategoryIdsByParent.get(slot.categoryId) ?? new Set<number>([slot.categoryId]);
    if (slot.productIds.some((productId) => !allowedCategoryIds.has(productRows.find((product) => product.id === productId)?.categoryId ?? -1))) throw new Error("Los artículos permitidos deben pertenecer a la familia seleccionada o a una de sus subfamilias.");
  }
  return database.transaction(async (tx) => {
    const existingRows = await tx.select({ id: promotions.id }).from(promotions).where(eq(promotions.productId, input.productId)).limit(1);
    let promotionId: number;
    if (existingRows[0]) {
      promotionId = existingRows[0].id;
      const oldSlots = await tx.select({ id: promotionSlots.id }).from(promotionSlots).where(eq(promotionSlots.promotionId, promotionId));
      if (oldSlots.length) await tx.delete(promotionSlotProducts).where(inArray(promotionSlotProducts.slotId, oldSlots.map((slot) => slot.id)));
      await tx.delete(promotionSlots).where(eq(promotionSlots.promotionId, promotionId));
      await tx.update(promotions).set({ name: input.name.trim(), comboPrice: money(input.comboPrice), isActive: true }).where(eq(promotions.id, promotionId));
    } else {
      const inserted = await tx.insert(promotions).values({ productId: input.productId, name: input.name.trim(), comboPrice: money(input.comboPrice), isActive: true });
      promotionId = Number(inserted[0].insertId);
    }
    for (const [index, slot] of input.slots.entries()) {
      const insertedSlot = await tx.insert(promotionSlots).values({ promotionId, position: index + 1, label: slot.label.trim(), categoryId: slot.categoryId });
      const slotId = Number(insertedSlot[0].insertId);
      await tx.insert(promotionSlotProducts).values(slot.productIds.map((productId) => ({ slotId, productId })));
    }
    return { id: promotionId, replaced: Boolean(existingRows[0]) };
  });
}

export async function updatePromotion(input: { id: number; productId: number; name: string; comboPrice: number; slots: Array<{ label: string; categoryId: number; productIds: number[] }> }) {
  await ensurePromotionSchema();
  const existing = await listPromotions();
  if (!existing.find((promotion) => promotion.id === input.id)) throw new Error("No se encontró la promoción.");
  return requireDb().transaction(async (tx) => {
    await tx.delete(promotionSlotProducts).where(inArray(promotionSlotProducts.slotId, (await tx.select({ id: promotionSlots.id }).from(promotionSlots).where(eq(promotionSlots.promotionId, input.id))).map((slot) => slot.id)));
    await tx.delete(promotionSlots).where(eq(promotionSlots.promotionId, input.id));
    await tx.update(promotions).set({ productId: input.productId, name: input.name.trim(), comboPrice: money(input.comboPrice) }).where(eq(promotions.id, input.id));
    for (const [index, slot] of input.slots.entries()) {
      const insertedSlot = await tx.insert(promotionSlots).values({ promotionId: input.id, position: index + 1, label: slot.label.trim(), categoryId: slot.categoryId });
      await tx.insert(promotionSlotProducts).values(slot.productIds.map((productId) => ({ slotId: Number(insertedSlot[0].insertId), productId })));
    }
    return { success: true };
  });
}

export async function deactivatePromotion(id: number) {
  await ensurePromotionSchema();
  const database = requireDb();
  await database.update(promotions).set({ isActive: false }).where(eq(promotions.id, id));
  return { success: true };
}

export async function getPromotionDetails(id: number) {
  const rows = await listPromotions();
  const promotion = rows.find((item) => item.id === id && item.isActive);
  if (!promotion) throw new Error("No se encontró la promoción activa.");
  return promotion;
}

export async function reorderCategories(items: Array<{ id: number; sortOrder: number }>) {
  const database = requireDb();
  await database.transaction(async (tx) => {
    for (const item of items) await tx.update(categories).set({ sortOrder: item.sortOrder }).where(eq(categories.id, item.id));
  });
  return { success: true };
}

export async function updateProduct(input: {
  id: number;
  name?: string;
  categoryId?: number;
  salePrice?: number;
  minimumStock?: number;
  isFeatured?: boolean;
  isActive?: boolean;
  imageUrl?: string | null;
  imageZoom?: number;
  imagePositionX?: number;
  imagePositionY?: number;
  sku?: string | null;
  barcode?: string | null;
  vatTypeId?: number | null;
  vatRate?: number;
  lastPurchaseCostBeforeSurcharge?: number;
  lastPurchaseCost?: number;
  weightedAverageCostBeforeSurcharge?: number;
  weightedAverageCost?: number;
  equivalenceSurchargeRate?: number;
  showInTpv?: boolean;
}) {
  const database = requireDb();
  const updateSet: Record<string, unknown> = {};
  if (input.name !== undefined) updateSet.name = input.name.trim();
  if (input.categoryId !== undefined) updateSet.categoryId = input.categoryId;
  if (input.salePrice !== undefined) updateSet.salePrice = money(input.salePrice);
  if (input.minimumStock !== undefined) updateSet.minimumStock = quantity(input.minimumStock);
  if (input.isFeatured !== undefined) updateSet.isFeatured = input.isFeatured;
  if (input.showInTpv !== undefined) updateSet.showInTpv = input.showInTpv;
  if (input.isActive !== undefined) updateSet.isActive = input.isActive;
  if (input.imageUrl !== undefined) updateSet.imageUrl = input.imageUrl?.trim() || null;
  if (input.imageZoom !== undefined) updateSet.imageZoom = money(Math.min(3, Math.max(0.5, input.imageZoom)));
  if (input.imagePositionX !== undefined) updateSet.imagePositionX = money(Math.min(100, Math.max(0, input.imagePositionX)));
  if (input.imagePositionY !== undefined) updateSet.imagePositionY = money(Math.min(100, Math.max(0, input.imagePositionY)));
  if (input.sku !== undefined) updateSet.sku = input.sku?.trim() || null;
  if (input.barcode !== undefined) updateSet.barcode = input.barcode?.trim() || null;
  if (input.vatTypeId !== undefined) {
    updateSet.vatTypeId = input.vatTypeId;
    if (input.vatTypeId !== null) {
      const selectedVat = await database.select({ rate: vatTypes.rate }).from(vatTypes).where(and(eq(vatTypes.id, input.vatTypeId), eq(vatTypes.isActive, true))).limit(1);
      if (!selectedVat[0]) throw new Error("El tipo de IVA seleccionado no existe o está inactivo.");
      updateSet.vatRate = money(toNumber(selectedVat[0].rate));
    }
  }
  if (input.vatRate !== undefined && input.vatTypeId === undefined) updateSet.vatRate = money(input.vatRate);
  if (input.equivalenceSurchargeRate !== undefined) updateSet.equivalenceSurchargeRate = money(input.equivalenceSurchargeRate);
  if (input.lastPurchaseCostBeforeSurcharge !== undefined) updateSet.lastPurchaseCostBeforeSurcharge = money(input.lastPurchaseCostBeforeSurcharge);
  if (input.lastPurchaseCost !== undefined) updateSet.lastPurchaseCost = money(input.lastPurchaseCost);
  if (input.weightedAverageCostBeforeSurcharge !== undefined) updateSet.weightedAverageCostBeforeSurcharge = money(input.weightedAverageCostBeforeSurcharge);
  if (input.weightedAverageCost !== undefined) updateSet.weightedAverageCost = money(input.weightedAverageCost);
  if (Object.keys(updateSet).length > 0) await database.update(products).set(updateSet).where(eq(products.id, input.id));
  return { success: true };
}

export async function adjustInventory(input: { productId: number; newQuantity: number; note?: string }) {
  const database = requireDb();
  if (input.newQuantity < 0) throw new Error("El stock no puede ser negativo.");
  return database.transaction(async (tx) => {
    const current = await tx.select().from(inventoryBalances).where(eq(inventoryBalances.productId, input.productId)).limit(1);
    const quantityBefore = toNumber(current[0]?.quantityOnHand);
    const quantityAfter = input.newQuantity;
    if (current[0]) {
      await tx.update(inventoryBalances).set({ quantityOnHand: quantity(quantityAfter) }).where(eq(inventoryBalances.productId, input.productId));
    } else {
      await tx.insert(inventoryBalances).values({ productId: input.productId, quantityOnHand: quantity(quantityAfter) });
    }
    await tx.insert(stockMovements).values({
      productId: input.productId,
      movementType: "adjustment",
      quantityDelta: quantity(quantityAfter - quantityBefore),
      quantityBefore: quantity(quantityBefore),
      quantityAfter: quantity(quantityAfter),
      sourceType: "manual_adjustment",
      note: input.note?.trim() || "Ajuste manual de inventario",
    });
    return { productId: input.productId, quantityBefore: quantity(quantityBefore), quantityAfter: quantity(quantityAfter) };
  });
}

export async function listAdminSuppliers() {
  const database = requireDb();
  return database.select().from(suppliers).where(eq(suppliers.isActive, true)).orderBy(asc(suppliers.name));
}

export async function createSupplier(input: { name: string; legalName?: string; taxId?: string; phone?: string; email?: string; notes?: string }) {
  const database = requireDb();
  const inserted = await database.insert(suppliers).values({
    name: input.name.trim(),
    legalName: input.legalName?.trim() || null,
    taxId: input.taxId?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  return { id: Number(inserted[0].insertId) };
}

export async function updateSupplier(input: { id: number; name?: string; legalName?: string | null; taxId?: string | null; phone?: string | null; email?: string | null; notes?: string | null }) {
  const database = requireDb();
  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name.trim();
  if (input.legalName !== undefined) values.legalName = input.legalName?.trim() || null;
  if (input.taxId !== undefined) values.taxId = input.taxId?.trim() || null;
  if (input.phone !== undefined) values.phone = input.phone?.trim() || null;
  if (input.email !== undefined) values.email = input.email?.trim() || null;
  if (input.notes !== undefined) values.notes = input.notes?.trim() || null;
  if (Object.keys(values).length > 0) await database.update(suppliers).set(values).where(eq(suppliers.id, input.id));
  return { success: true, id: input.id };
}

export async function listSalesReport() {
  const database = requireDb();
  const rows = await database
    .select({
      productId: saleLines.productId,
      productName: saleLines.productName,
      units: sql<string>`coalesce(sum(${saleLines.quantity}), 0)`,
      revenue: sql<string>`coalesce(sum(${saleLines.lineTotal}), 0)`,
      cost: sql<string>`coalesce(sum(${saleLines.unitCost} * ${saleLines.quantity}), 0)`,
    })
    .from(saleLines)
    .innerJoin(sales, eq(sales.id, saleLines.saleId))
    .where(eq(sales.status, "completed"))
    .groupBy(saleLines.productId, saleLines.productName)
    .orderBy(desc(sql`sum(${saleLines.lineTotal})`));
  return rows.map((row) => ({ ...row, margin: money(toNumber(row.revenue) - toNumber(row.cost)) }));
}

export async function listPurchaseInvoices() {
  const database = requireDb();
  return database
    .select({
      id: purchaseInvoices.id,
      invoiceNumber: purchaseInvoices.invoiceNumber,
      invoiceDate: purchaseInvoices.invoiceDate,
      totalAmount: purchaseInvoices.totalAmount,
      ocrStatus: purchaseInvoices.ocrStatus,
      status: purchaseInvoices.status,
      supplierName: sql<string>`coalesce(${suppliers.name}, ${purchaseInvoices.detectedSupplierName})`,
      createdAt: purchaseInvoices.createdAt,
    })
    .from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(sql`${purchaseInvoices.status} <> 'void'`)
    .orderBy(desc(purchaseInvoices.createdAt));
}


export async function createPurchaseInvoice(input: {
  supplierId?: number;
  detectedSupplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  subtotal?: number;
  vatAmount?: number;
  totalAmount?: number;
  documentUrl?: string;
  documentName?: string;
  ocrData?: unknown;
  notes?: string;
  lines: Array<{ productId?: number; detectedName?: string; supplierReference?: string; quantity: number; unitCost: number; vatRate?: number; lineTotal: number }>;
}) {
  const database = requireDb();
  if (input.lines.length === 0) throw new Error("La factura debe contener al menos una línea.");
  return database.transaction(async (tx) => {
    const inserted = await tx.insert(purchaseInvoices).values({
      supplierId: input.supplierId ?? null,
      detectedSupplierName: input.detectedSupplierName?.trim() || null,
      invoiceNumber: input.invoiceNumber?.trim() || null,
      invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
      subtotal: money(input.subtotal ?? 0),
      vatAmount: money(input.vatAmount ?? 0),
      totalAmount: money(input.totalAmount ?? 0),
      documentUrl: input.documentUrl?.trim() || null,
      documentName: input.documentName?.trim() || null,
      ocrData: input.ocrData ?? null,
      notes: input.notes?.trim() || null,
      ocrStatus: input.ocrData ? "ready" : "not_requested",
      status: "draft",
    });
    const invoiceId = Number(inserted[0].insertId);
    const lineIds: number[] = [];
    for (const line of input.lines) {
      const lineInserted = await tx.insert(purchaseInvoiceLines).values({
        purchaseInvoiceId: invoiceId,
        productId: line.productId ?? null,
        detectedName: line.detectedName?.trim() || null,
        supplierReference: line.supplierReference?.trim() || null,
        quantity: quantity(line.quantity),
        unitCost: money(line.unitCost),
        vatRate: money(line.vatRate ?? 7),
        lineTotal: money(line.lineTotal),
      });
      lineIds.push(Number(lineInserted[0].insertId));
    }
    return { id: invoiceId, lineIds, status: "draft" as const };
  });
}

export async function receivePurchaseInvoice(invoiceId: number, lineMappings?: Array<{ lineId: number; productId: number; quantity: number; unitCost: number; lineTotal: number }>) {
  const database = requireDb();
  return database.transaction(async (tx) => {
    const invoice = await tx.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId)).limit(1);
    if (!invoice[0]) throw new Error("No se encontró la factura.");
    if (invoice[0].status !== "draft") throw new Error("La factura ya no está pendiente de recepción.");
    let lines = await tx.select().from(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.purchaseInvoiceId, invoiceId));
    if (lines.length === 0) throw new Error("La factura no contiene líneas.");
    if (lineMappings?.length) {
      const mappingById = new Map(lineMappings.map((mapping) => [mapping.lineId, mapping]));
      for (const line of lines) {
        const mapping = mappingById.get(line.id);
        if (!mapping) throw new Error(`La línea «${line.detectedName ?? "sin nombre"}» debe asociarse a un producto.`);
        await tx.update(purchaseInvoiceLines).set({ productId: mapping.productId, quantity: quantity(mapping.quantity), unitCost: money(mapping.unitCost), lineTotal: money(mapping.lineTotal) }).where(eq(purchaseInvoiceLines.id, line.id));
      }
      lines = await tx.select().from(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.purchaseInvoiceId, invoiceId));
    }

    for (const line of lines) {
      if (!line.productId) throw new Error(`La línea «${line.detectedName ?? "sin nombre"}» debe asociarse a un producto antes de recibirla.`);
      const product = await tx.select().from(products).where(eq(products.id, line.productId)).limit(1);
      if (!product[0]) throw new Error("Una línea de la factura referencia un producto inexistente.");
      const balance = await tx.select().from(inventoryBalances).where(eq(inventoryBalances.productId, line.productId)).limit(1);
      const quantityBefore = toNumber(balance[0]?.quantityOnHand);
      const purchaseQuantity = toNumber(line.quantity);
      const quantityAfter = quantityBefore + purchaseQuantity;
      const previousCost = toNumber(product[0].weightedAverageCost);
      const purchaseCost = toNumber(line.unitCost);
      const weightedCost = quantityAfter > 0 ? ((quantityBefore * previousCost) + (purchaseQuantity * purchaseCost)) / quantityAfter : purchaseCost;
      if (balance[0]) {
        await tx.update(inventoryBalances).set({ quantityOnHand: quantity(quantityAfter) }).where(eq(inventoryBalances.productId, line.productId));
      } else {
        await tx.insert(inventoryBalances).values({ productId: line.productId, quantityOnHand: quantity(quantityAfter) });
      }
      await tx.update(products).set({ lastPurchaseCost: money(purchaseCost), weightedAverageCost: money(weightedCost) }).where(eq(products.id, line.productId));
      await tx.insert(stockMovements).values({
        productId: line.productId,
        movementType: "purchase_receipt",
        quantityDelta: quantity(purchaseQuantity),
        quantityBefore: quantity(quantityBefore),
        quantityAfter: quantity(quantityAfter),
        unitCost: money(purchaseCost),
        sourceType: "purchase_invoice",
        sourceId: invoiceId,
        note: `Recepción de factura ${invoice[0].invoiceNumber ?? invoiceId}`,
      });
    }

    await tx.update(purchaseInvoices).set({ status: "received", ocrStatus: "reviewed" }).where(eq(purchaseInvoices.id, invoiceId));
    return { id: invoiceId, status: "received" as const };
  });
}


function formatBusinessHour(value: Date) {
  return new Intl.DateTimeFormat("es-ES", { timeZone: process.env.BUSINESS_TIMEZONE ?? "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
}

function shiftBusinessDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

type ReportGroup = "auto" | "hour" | "day" | "week" | "month";

function reportGroup(period: string, from: string, to: string, requested: ReportGroup = "auto"): Exclude<ReportGroup, "auto"> {
  if (requested !== "auto") return requested;
  const fromDate = new Date(`${from}T12:00:00Z`).getTime();
  const toDate = new Date(`${to}T12:00:00Z`).getTime();
  const spanDays = Number.isFinite(fromDate) && Number.isFinite(toDate) ? Math.max(1, Math.round((toDate - fromDate) / 86400000) + 1) : 1;
  if (period === "day" || spanDays <= 1) return "hour";
  if (period === "week" || spanDays <= 14) return "day";
  return "month";
}

function madridHourNumber(date: Date | null) {
  if (!date) return null;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: process.env.BUSINESS_TIMEZONE ?? "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(date));
  return Number.isFinite(hour) ? hour : null;
}

function hourOrder(hour: number) { return (hour + 17) % 24; }
function hourLabel(hour: number) { return `${String(hour).padStart(2, "0")}:00`; }

function reportWeekStart(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return shiftBusinessDate(date, mondayOffset);
}

function trimHourlySeries<T extends { hour: number; tickets: number }>(rows: T[]) {
  const byHour = new Map(rows.map((row) => [row.hour, row]));
  const active = rows.filter((row) => row.tickets > 0).sort((a, b) => hourOrder(a.hour) - hourOrder(b.hour));
  if (!active.length) return [];
  const start = hourOrder(active[0].hour);
  const end = hourOrder(active[active.length - 1].hour);
  const count = end >= start ? end - start + 1 : 24 - start + end + 1;
  return Array.from({ length: count }, (_, index) => {
    const hour = (start + index + 7) % 24;
    return byHour.get(hour) ?? ({ hour, tickets: 0 } as T);
  });
}

function reportRange(period: string, customFrom?: string, customTo?: string) {
  const today = getBusinessDate();
  if (period === "custom" && customFrom && customTo) return { from: customFrom, to: customTo };
  if (period === "day") return { from: today, to: today };
  if (period === "week") {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const from = shiftBusinessDate(today, mondayOffset);
    return { from, to: shiftBusinessDate(from, 6) };
  }
  if (period === "month") {
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }
  if (period === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  const month = Number(today.slice(5, 7));
  const quarterStart = Math.floor((month - 1) / 3) * 3 + 1;
  return { from: `${today.slice(0, 4)}-${String(quarterStart).padStart(2, "0")}-01`, to: today };
}

export async function getReports(input: { period?: string; from?: string; to?: string; group?: ReportGroup } = {}) {
  const database = requireDb();
  const period = input.period ?? "day";
  const range = reportRange(period, input.from, input.to);
  const group = reportGroup(period, range.from, range.to, input.group);
  const salesRows = await database
    .select({ id: sales.id, businessDate: cashSessions.businessDate, totalAmount: sales.totalAmount, subtotal: sales.subtotal, vatAmount: sales.vatAmount, createdAt: sales.createdAt, method: payments.method })
    .from(sales)
    .innerJoin(cashSessions, eq(cashSessions.id, sales.cashSessionId))
    .leftJoin(payments, eq(payments.saleId, sales.id))
    .where(and(eq(sales.status, "completed"), sql`${cashSessions.businessDate} >= ${range.from}`, sql`${cashSessions.businessDate} <= ${range.to}`))
    .orderBy(asc(cashSessions.businessDate), asc(sales.createdAt));
  const lineRows = await database
    .select({ saleId: saleLines.saleId, productId: saleLines.productId, productName: saleLines.productName, quantity: saleLines.quantity, lineTotal: saleLines.lineTotal, lineVat: saleLines.lineVat, unitCost: saleLines.unitCost, businessDate: cashSessions.businessDate, categoryName: categories.name })
    .from(saleLines)
    .innerJoin(sales, eq(sales.id, saleLines.saleId))
    .innerJoin(cashSessions, eq(cashSessions.id, sales.cashSessionId))
    .leftJoin(products, eq(products.id, saleLines.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(sales.status, "completed"), sql`${cashSessions.businessDate} >= ${range.from}`, sql`${cashSessions.businessDate} <= ${range.to}`));

  const totalSold = salesRows.reduce((sum, row) => sum + toNumber(row.totalAmount), 0);
  const subtotal = salesRows.reduce((sum, row) => sum + toNumber(row.subtotal), 0);
  const vat = salesRows.reduce((sum, row) => sum + toNumber(row.vatAmount), 0);
  const cash = salesRows.filter((row) => row.method === "cash").reduce((sum, row) => sum + toNumber(row.totalAmount), 0);
  const card = salesRows.filter((row) => row.method === "card").reduce((sum, row) => sum + toNumber(row.totalAmount), 0);
  const totalCost = lineRows.reduce((sum, row) => sum + toNumber(row.unitCost) * toNumber(row.quantity), 0);
  const costBySale = new Map<number, number>();
  for (const row of lineRows) costBySale.set(row.saleId, (costBySale.get(row.saleId) ?? 0) + toNumber(row.unitCost) * toNumber(row.quantity));
  const seriesMap = new Map<string, { total: number; tickets: number; cash: number; card: number; cost: number }>();
  const seriesHours: Array<{ hour: number; tickets: number; total: number; cash: number; card: number; cost: number }> = [];
  for (const row of salesRows) {
    const localHour = madridHourNumber(row.createdAt);
    const key = group === "hour" && localHour !== null ? hourLabel(localHour) : group === "week" ? reportWeekStart(row.businessDate) : group === "month" ? row.businessDate.slice(0, 7) : row.businessDate;
    const current = seriesMap.get(key) ?? { total: 0, tickets: 0, cash: 0, card: 0, cost: 0 };
    const rowCost = costBySale.get(row.id) ?? 0;
    current.total += toNumber(row.totalAmount); current.tickets += 1; current.cost += rowCost;
    if (row.method === "cash") current.cash += toNumber(row.totalAmount);
    if (row.method === "card") current.card += toNumber(row.totalAmount);
    seriesMap.set(key, current);
    if (group === "hour" && localHour !== null) {
      const hourCurrent = seriesHours[localHour] ?? { hour: localHour, tickets: 0, total: 0, cash: 0, card: 0, cost: 0 };
      hourCurrent.tickets += 1; hourCurrent.total += toNumber(row.totalAmount); hourCurrent.cost += rowCost;
      if (row.method === "cash") hourCurrent.cash += toNumber(row.totalAmount);
      if (row.method === "card") hourCurrent.card += toNumber(row.totalAmount);
      seriesHours[localHour] = hourCurrent;
    }
  }
  const aggregateLines = (keyOf: (row: typeof lineRows[number]) => string) => {
    const map = new Map<string, { key: string; units: number; revenue: number; cost: number; vat: number }>();
    for (const row of lineRows) {
      const key = keyOf(row); const current = map.get(key) ?? { key, units: 0, revenue: 0, cost: 0, vat: 0 };
      current.units += toNumber(row.quantity); current.revenue += toNumber(row.lineTotal); current.cost += toNumber(row.unitCost) * toNumber(row.quantity); current.vat += toNumber(row.lineVat); map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  };
  const topProducts = aggregateLines((row) => `${row.productId ?? "none"}::${row.productName}`).slice(0, 20).map((row) => ({ productId: row.key.split("::")[0] === "none" ? null : Number(row.key.split("::")[0]), productName: row.key.split("::").slice(1).join("::"), units: row.units.toFixed(3), revenue: money(row.revenue), cost: money(row.cost), margin: money(row.revenue - row.cost) }));
  const byFamily = aggregateLines((row) => row.categoryName ?? "Sin familia").map((row) => ({ family: row.key, units: row.units.toFixed(3), revenue: money(row.revenue), cost: money(row.cost), margin: money(row.revenue - row.cost) }));
  const vatBreakdown = aggregateLines((row) => String(row.lineVat ?? "0")).map((row) => ({ vat: row.key, revenue: money(row.revenue), vatAmount: money(row.vat), units: row.units.toFixed(3) }));
  return {
    period, group, from: range.from, to: range.to,
    totals: { totalSold: money(totalSold), subtotal: money(subtotal), vat: money(vat), cash: money(cash), card: money(card), cost: money(totalCost), margin: money(totalSold - totalCost), tickets: salesRows.length },
    series: group === "hour" ? trimHourlySeries(Array.from({ length: 24 }, (_, hour) => { const row = seriesHours[hour] ?? { hour, tickets: 0, total: 0, cash: 0, card: 0, cost: 0 }; return row; })).map((row) => ({ label: hourLabel(row.hour), total: money(row.total), tickets: row.tickets, cash: money(row.cash), card: money(row.card), cost: money(row.cost), margin: money(row.total - row.cost) })) : [...seriesMap.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([label, row]) => ({ label, total: money(row.total), tickets: row.tickets, cash: money(row.cash), card: money(row.card), cost: money(row.cost), margin: money(row.total - row.cost) })),
    topProducts, byFamily, vatBreakdown,
  };
}

export async function getDailyAnalysis() {
  const database = requireDb();
  const session = await getOrCreateCashSession();
  const saleRows = await database
    .select({ id: sales.id, totalAmount: sales.totalAmount, createdAt: sales.createdAt, method: payments.method })
    .from(sales)
    .leftJoin(payments, eq(payments.saleId, sales.id))
    .where(and(eq(sales.cashSessionId, session.id), eq(sales.status, "completed")))
    .orderBy(asc(sales.createdAt));
  const lineRows = await database
    .select({ productId: saleLines.productId, productName: saleLines.productName, units: saleLines.quantity, revenue: saleLines.lineTotal })
    .from(saleLines)
    .innerJoin(sales, eq(sales.id, saleLines.saleId))
    .where(and(eq(sales.cashSessionId, session.id), eq(sales.status, "completed")));

  const hourly = new Map<number, { total: number; tickets: number; cash: number; card: number }>();
  for (let index = 0; index < 24; index += 1) hourly.set(index, { total: 0, tickets: 0, cash: 0, card: 0 });
  for (const sale of saleRows) {
    const localHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: process.env.BUSINESS_TIMEZONE ?? "Europe/Madrid", hour: "2-digit", hour12: false }).format(sale.createdAt));
    const bucket = hourly.get(localHour) ?? { total: 0, tickets: 0, cash: 0, card: 0 };
    bucket.total += toNumber(sale.totalAmount);
    bucket.tickets += 1;
    if (sale.method === "cash") bucket.cash += toNumber(sale.totalAmount);
    if (sale.method === "card") bucket.card += toNumber(sale.totalAmount);
    hourly.set(localHour, bucket);
  }
  const topProducts = new Map<number, { productId: number | null; productName: string; units: number; revenue: number }>();
  for (const line of lineRows) {
    const key = line.productId ?? -line.productName.length;
    const current = topProducts.get(key) ?? { productId: line.productId, productName: line.productName, units: 0, revenue: 0 };
    current.units += toNumber(line.units);
    current.revenue += toNumber(line.revenue);
    topProducts.set(key, current);
  }
  const totalSold = saleRows.reduce((sum, sale) => sum + toNumber(sale.totalAmount), 0);
  const cashSold = saleRows.filter((sale) => sale.method === "cash").reduce((sum, sale) => sum + toNumber(sale.totalAmount), 0);
  const cardSold = saleRows.filter((sale) => sale.method === "card").reduce((sum, sale) => sum + toNumber(sale.totalAmount), 0);
  return {
    businessDate: session.businessDate,
    sessionId: session.id,
    status: session.status,
    totalSold: money(totalSold),
    cashSold: money(cashSold),
    cardSold: money(cardSold),
    expectedCash: money(toNumber(session.openingFloat) + cashSold),
    tickets: saleRows.length,
    hourly: [...hourly.entries()].map(([hour, values]) => ({ hour, label: `${String(hour).padStart(2, "0")}:00`, ...values, total: money(values.total), cash: money(values.cash), card: money(values.card) })),
    topProducts: [...topProducts.values()].sort((a, b) => b.units - a.units).slice(0, 10).map((product) => ({ ...product, units: product.units.toFixed(3), revenue: money(product.revenue) })),
  };
}

export async function getSaleDetails(saleId: number) {
  const database = requireDb();
  const sale = await database.select({ sale: sales, payment: payments }).from(sales).leftJoin(payments, eq(payments.saleId, sales.id)).where(eq(sales.id, saleId)).limit(1);
  if (!sale[0]) throw new Error("No se encontró el ticket.");
  const lines = await database.select().from(saleLines).where(eq(saleLines.saleId, saleId)).orderBy(asc(saleLines.id));
  const fiscal = await database
    .select({ invoice: fiscalInvoices, record: fiscalRecords })
    .from(fiscalInvoices)
    .leftJoin(fiscalRecords, and(eq(fiscalRecords.fiscalInvoiceId, fiscalInvoices.id), eq(fiscalRecords.recordType, "high")))
    .where(eq(fiscalInvoices.saleId, saleId))
    .limit(1);
  return { ...sale[0].sale, payment: sale[0].payment, lines, fiscal: fiscal[0] ? { ...fiscal[0].invoice, record: fiscal[0].record } : null };
}


export async function deactivateProduct(productId: number) {
  const database = requireDb();
  await database.update(products).set({ isActive: false }).where(eq(products.id, productId));
  return { success: true, id: productId };
}

export async function deactivateSupplier(supplierId: number) {
  const database = requireDb();
  await database.update(suppliers).set({ isActive: false }).where(eq(suppliers.id, supplierId));
  return { success: true, id: supplierId };
}

export async function voidPurchaseInvoice(invoiceId: number) {
  const database = requireDb();
  const invoice = await database.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId)).limit(1);
  if (!invoice[0]) throw new Error("No se encontró la factura.");
  if (invoice[0].status !== "draft") throw new Error("Solo se pueden anular facturas que aún no han sido recibidas.");
  await database.update(purchaseInvoices).set({ status: "void" }).where(eq(purchaseInvoices.id, invoiceId));
  return { success: true, id: invoiceId, status: "void" as const };
}


export async function listCashSessions(limit = 60) {
  const database = requireDb();
  const rows = await database.select().from(cashSessions).orderBy(desc(cashSessions.businessDate), desc(cashSessions.id)).limit(limit);
  return Promise.all(rows.map(async (row) => {
    const aggregate = await database.select({ totalSold: sql<string>`coalesce(sum(${sales.totalAmount}), 0)` }).from(sales).where(and(eq(sales.cashSessionId, row.id), eq(sales.status, "completed")));
    return { ...row, totalSold: aggregate[0]?.totalSold ?? "0.00" };
  }));
}

export async function updateClosedCashSession(input: { id: number; countedCash: number; countedCard: number; denominationCounts?: Record<string, number>; notes?: string | null }) {
  const database = requireDb();
  const current = await database.select().from(cashSessions).where(eq(cashSessions.id, input.id)).limit(1);
  if (!current[0]) throw new Error("No se encontró la caja.");
  if (current[0].status !== "closed") throw new Error("Solo se pueden editar cajas cerradas.");
  const difference = money(input.countedCash - toNumber(current[0].expectedCash));
  await database.update(cashSessions).set({ countedCash: money(input.countedCash), countedCard: money(input.countedCard), denominationCounts: input.denominationCounts ?? null, difference, notes: input.notes?.trim() || null }).where(eq(cashSessions.id, input.id));
  return { success: true, id: input.id, difference };
}


function normalizeCatalogText(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function boundedCatalogText(value: string | null | undefined, maxLength: number) {
  const normalized = (value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function loyverseItemVatRate(rawData: unknown, taxRateById: Map<string, number>) {
  const rawItem = rawData && typeof rawData === "object" && !Array.isArray(rawData) ? rawData as Record<string, unknown> : {};
  const taxIds = Array.isArray(rawItem.tax_ids) ? rawItem.tax_ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  const rates = taxIds.map((taxId) => taxRateById.get(taxId)).filter((rate): rate is number => rate !== undefined && Number.isFinite(rate));
  if (!rates.length) return null;
  const combinedRate = rates.reduce((sum, rate) => sum + rate, 0);
  return [0, 4, 10, 21].includes(combinedRate) ? combinedRate : null;
}

async function restoreLegacyLocalCategories() {
  const database = requireDb();
  return database.transaction(async (tx) => {
    const [allCategories, remoteItems, allProducts] = await Promise.all([
      tx.select().from(categories),
      tx.select().from(loyverseItems),
      tx.select({ id: products.id, categoryId: products.categoryId, loyverseItemId: products.loyverseItemId }).from(products),
    ]);
    const legacyCategories = allCategories.filter((category) => Boolean(category.loyverseId));
    if (!legacyCategories.length) return { restoredCategories: 0, reassignedProducts: 0 };
    const categoryIdByRemoteId = new Map(legacyCategories.map((category) => [category.loyverseId as string, category.id]));
    const itemCategoryByRemoteId = new Map(remoteItems.map((item) => [item.loyverseId, item.categoryLoyverseId]));
    let reassignedProducts = 0;
    for (const category of legacyCategories) {
      await tx.update(categories).set({ loyverseId: null, isActive: true }).where(eq(categories.id, category.id));
    }
    for (const product of allProducts) {
      if (!product.loyverseItemId) continue;
      const remoteCategoryId = itemCategoryByRemoteId.get(product.loyverseItemId);
      const localCategoryId = remoteCategoryId ? categoryIdByRemoteId.get(remoteCategoryId) : undefined;
      if (!localCategoryId || product.categoryId === localCategoryId) continue;
      await tx.update(products).set({ categoryId: localCategoryId }).where(eq(products.id, product.id));
      reassignedProducts += 1;
    }
    return { restoredCategories: legacyCategories.length, reassignedProducts };
  });
}

export async function restoreLocalCategoryAssignments() {
  return restoreLegacyLocalCategories();
}

async function ensureLoyverseTaxesSchema() {
  const database = requireDb();
  await database.execute(sql`CREATE TABLE IF NOT EXISTS pos_loyverse_taxes (
    id INT AUTO_INCREMENT NOT NULL,
    loyverse_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(64) NULL,
    rate DECIMAL(12,2) NULL,
    deleted_at DATETIME NULL,
    remote_created_at DATETIME NULL,
    remote_updated_at DATETIME NULL,
    raw_data JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY pos_loyverse_taxes_loyverse_id_unique (loyverse_id)
  )`);
}

export async function importLoyverseCatalogToOperational(requestedStoreId?: string) {
  await ensureLoyverseTaxesSchema();
  const database = requireDb();
  const [settingsRows, syncStates, remoteItems, remoteTaxes, remoteVariants, remotePrices, remoteInventory, localCategories, localProducts, localBalances] = await Promise.all([
    database.select().from(posSettings).limit(1),
    database.select().from(loyverseSyncState).limit(1),
    database.select().from(loyverseItems),
    database.select().from(loyverseTaxes),
    database.select().from(loyverseVariants),
    database.select().from(loyverseVariantPrices),
    database.select().from(loyverseInventoryLevels),
    database.select().from(categories),
    database.select().from(products),
    database.select().from(inventoryBalances),
  ]);
  if (!remoteItems.length || !remoteVariants.length) throw new Error("Primero sincroniza el catálogo de Loyverse para poder importarlo al TPV.");
  const receiptCostRows = await database.select({ variantId: loyverseReceiptLines.variantLoyverseId, averageCost: sql<string>`CASE WHEN SUM(${loyverseReceiptLines.quantity}) > 0 THEN SUM(${loyverseReceiptLines.costTotal}) / SUM(${loyverseReceiptLines.quantity}) ELSE 0 END` }).from(loyverseReceiptLines).groupBy(loyverseReceiptLines.variantLoyverseId);
  const cachedReceiptCostByVariant = new Map<string, number>();
  for (const row of receiptCostRows) { if (row.variantId) { const value = toNumber(row.averageCost); if (value > 0) cachedReceiptCostByVariant.set(row.variantId, value); } }

  const configuredStoreId = settingsRows[0]?.loyverseStoreId || syncStates[0]?.activeStoreId || null;
  const availableStoreId = requestedStoreId || configuredStoreId || remotePrices[0]?.storeLoyverseId || remoteInventory[0]?.storeLoyverseId || null;
  if (!availableStoreId) throw new Error("No hay ninguna tienda de Loyverse disponible para importar precios y stock.");

  const pricesByVariant = new Map<string, typeof remotePrices[number]>();
  for (const price of remotePrices) {
    if (price.storeLoyverseId === availableStoreId || !pricesByVariant.has(price.variantLoyverseId)) pricesByVariant.set(price.variantLoyverseId, price);
  }
  const stockByVariant = new Map<string, number>();
  for (const level of remoteInventory) {
    if (level.storeLoyverseId === availableStoreId) stockByVariant.set(level.variantLoyverseId, toNumber(level.inStock));
  }
  const variantsByItem = new Map<string, typeof remoteVariants>();
  for (const variant of remoteVariants) variantsByItem.set(variant.itemLoyverseId, [...(variantsByItem.get(variant.itemLoyverseId) ?? []), variant]);
  const taxRateById = new Map(remoteTaxes.map((tax) => [tax.loyverseId, toNumber(tax.rate)]));

  const imported = await database.transaction(async (tx) => {
    let categoriesCreated = 0;
    const categoriesUpdated = 0;
    const fallback = localCategories.find((category) => normalizeCatalogText(category.name) === "articulos sin asignar");
    if (!fallback) throw new Error("No existe la familia local «Artículos sin asignar». Créala antes de importar artículos nuevos.");

    const productByVariant = new Map<string, typeof localProducts[number]>();
    const productBySku = new Map<string, typeof localProducts[number]>();
    const productByBarcode = new Map<string, typeof localProducts[number]>();
    const productByName = new Map<string, typeof localProducts[number]>();
    for (const product of localProducts) {
      if (product.loyverseVariantId) productByVariant.set(product.loyverseVariantId, product);
      if (product.sku) productBySku.set(normalizeCatalogText(product.sku), product);
      if (product.barcode) productByBarcode.set(normalizeCatalogText(product.barcode), product);
      productByName.set(normalizeCatalogText(product.name), product);
    }
    const localCategoryById = new Map(localCategories.map((category) => [category.id, category]));
    const balanceByProduct = new Map(localBalances.map((balance) => [balance.productId, balance]));
    const configuredDefaultVatRate = toNumber(settingsRows[0]?.defaultVatRate ?? 10);
    const defaultVatRate = [0, 4, 10, 21].includes(configuredDefaultVatRate) ? configuredDefaultVatRate : 10;
    const activeVatTypes = await tx.select({ id: vatTypes.id, rate: vatTypes.rate }).from(vatTypes).where(eq(vatTypes.isActive, true));
    const defaultVat = activeVatTypes.find((vatType) => toNumber(vatType.rate) === defaultVatRate) ?? activeVatTypes.find((vatType) => toNumber(vatType.rate) === 10);
    const vatTypeIdByRate = new Map(activeVatTypes.map((vatType) => [toNumber(vatType.rate), vatType.id]));
    let productsCreated = 0;
    let productsUpdated = 0;
    let stockUpdated = 0;
    let costVariantsAvailable = 0;
    let costsUpdated = 0;
    let costsPreserved = 0;
    let productsWithRemoteVat = 0;
    let productsUsingVatFallback = 0;
    let skipped = 0;
    const skippedDetails: string[] = [];

    for (const item of remoteItems) {
      const itemVariants = variantsByItem.get(item.loyverseId) ?? [];
      for (const variant of itemVariants) {
        const optionLabel = [variant.option1Value, variant.option2Value, variant.option3Value].filter(Boolean).join(" / ");
        const productName = boundedCatalogText(optionLabel && itemVariants.length > 1 ? `${item.itemName} · ${optionLabel}` : item.itemName, 255) || `Loyverse ${variant.loyverseId.slice(0, 8)}`;
        const skuValue = boundedCatalogText(variant.sku, 100);
        const barcodeValue = boundedCatalogText(variant.barcode, 100);
        const priceRow = pricesByVariant.get(variant.loyverseId);
        const salePrice = toNumber(priceRow?.price ?? variant.defaultPrice);
        const remotePurchaseCost = toNumber(variant.purchaseCost);
        const remoteCost = toNumber(variant.cost);
        const receiptCost = cachedReceiptCostByVariant.get(variant.loyverseId) ?? 0;
        const importedCost = remotePurchaseCost > 0 ? remotePurchaseCost : remoteCost > 0 ? remoteCost : receiptCost;
        if (importedCost > 0) costVariantsAvailable += 1;
        const stockAfter = stockByVariant.get(variant.loyverseId) ?? 0;
        const skuKey = normalizeCatalogText(skuValue);
        const barcodeKey = normalizeCatalogText(barcodeValue);
        let local = productByVariant.get(variant.loyverseId) ?? (skuKey ? productBySku.get(skuKey) : undefined) ?? (barcodeKey ? productByBarcode.get(barcodeKey) : undefined) ?? productByName.get(normalizeCatalogText(productName));
        if (local && local.loyverseVariantId && local.loyverseVariantId !== variant.loyverseId) local = undefined;
        try {
          const currentCategory = local ? localCategoryById.get(local.categoryId) : undefined;
          const categoryId = local && currentCategory ? local.categoryId : fallback.id;
          const localWeightedCost = local ? toNumber(local.weightedAverageCost) : 0;
          const localLastCost = local ? toNumber(local.lastPurchaseCost) : 0;
          const effectiveCost = localWeightedCost > 0 ? localWeightedCost : localLastCost > 0 ? localLastCost : importedCost;
        const localVatRate = local ? toNumber(local.vatRate) : 0;
        const remoteVatRate = loyverseItemVatRate(item.rawData, taxRateById);
        if (remoteVatRate !== null) productsWithRemoteVat += 1;
        else productsUsingVatFallback += 1;
        const localVatIsValid = [0, 4, 10, 21].includes(localVatRate);
        const candidateVatRate = remoteVatRate ?? (local && localVatIsValid ? localVatRate : defaultVatRate);
        const importedVatRate = vatTypeIdByRate.has(candidateVatRate) ? candidateVatRate : defaultVatRate;
        const importedVatTypeId = vatTypeIdByRate.get(importedVatRate) ?? defaultVat?.id ?? null;
        const importedSurchargeRate = importedVatRate === 10 ? 1.4 : importedVatRate === 21 ? 5.2 : 0;
          if (!local) {
          const inserted = await tx.insert(products).values({ loyverseItemId: item.loyverseId, loyverseVariantId: variant.loyverseId, loyverseStoreId: availableStoreId, categoryId, name: productName, sku: skuValue, barcode: barcodeValue, imageUrl: item.imageUrl || null, salePrice: money(salePrice), vatTypeId: importedVatTypeId, vatRate: money(importedVatRate), equivalenceSurchargeRate: money(importedSurchargeRate), showInTpv: !item.deletedAt && (priceRow?.availableForSale ?? true), isActive: !item.deletedAt, lastPurchaseCostBeforeSurcharge: money(effectiveCost), lastPurchaseCost: money(effectiveCost), weightedAverageCostBeforeSurcharge: money(effectiveCost), weightedAverageCost: money(effectiveCost), minimumStock: quantity(toNumber(priceRow?.lowStock)) });
            const productId = Number(inserted[0].insertId);
            local = { id: productId, loyverseItemId: item.loyverseId, loyverseVariantId: variant.loyverseId, loyverseStoreId: availableStoreId, categoryId, name: productName, sku: skuValue, barcode: barcodeValue, imageUrl: item.imageUrl || null, salePrice: money(salePrice), vatTypeId: importedVatTypeId, vatRate: money(importedVatRate), equivalenceSurchargeRate: money(importedSurchargeRate), showInTpv: !item.deletedAt && (priceRow?.availableForSale ?? true), isActive: !item.deletedAt, minimumStock: quantity(toNumber(priceRow?.lowStock)) } as typeof localProducts[number];
            localProducts.push(local);
            productsCreated += 1;
            if (effectiveCost > 0) costsUpdated += 1;
          } else {
            await tx.update(products).set({ loyverseItemId: item.loyverseId, loyverseVariantId: variant.loyverseId, loyverseStoreId: availableStoreId, categoryId, name: productName, sku: skuValue || local.sku || null, barcode: barcodeValue || local.barcode || null, imageUrl: item.imageUrl || local.imageUrl || null, salePrice: money(salePrice), vatTypeId: importedVatTypeId, vatRate: money(importedVatRate), showInTpv: !item.deletedAt && (priceRow?.availableForSale ?? true), isActive: !item.deletedAt, minimumStock: quantity(toNumber(priceRow?.lowStock)), ...(effectiveCost > 0 && localWeightedCost <= 0 && localLastCost <= 0 ? { lastPurchaseCostBeforeSurcharge: money(effectiveCost), lastPurchaseCost: money(effectiveCost), weightedAverageCostBeforeSurcharge: money(effectiveCost), weightedAverageCost: money(effectiveCost) } : {}) }).where(eq(products.id, local.id));
            local = { ...local, loyverseItemId: item.loyverseId, loyverseVariantId: variant.loyverseId, loyverseStoreId: availableStoreId, categoryId, name: productName, sku: skuValue || local.sku || null, barcode: barcodeValue || local.barcode || null, imageUrl: item.imageUrl || local.imageUrl || null, salePrice: money(salePrice), vatTypeId: importedVatTypeId, vatRate: money(importedVatRate), showInTpv: !item.deletedAt && (priceRow?.availableForSale ?? true), isActive: !item.deletedAt, minimumStock: quantity(toNumber(priceRow?.lowStock)) } as typeof localProducts[number];
            productsUpdated += 1;
            if (effectiveCost > 0 && localWeightedCost <= 0 && localLastCost <= 0) costsUpdated += 1;
            else if (localWeightedCost > 0 || localLastCost > 0) costsPreserved += 1;
          }
          productByVariant.set(variant.loyverseId, local);
          if (local.sku) productBySku.set(normalizeCatalogText(local.sku), local);
          if (local.barcode) productByBarcode.set(normalizeCatalogText(local.barcode), local);
          productByName.set(normalizeCatalogText(local.name), local);
          const current = balanceByProduct.get(local.id);
          const stockBefore = toNumber(current?.quantityOnHand);
          if (!current) {
            await tx.insert(inventoryBalances).values({ productId: local.id, quantityOnHand: quantity(stockAfter) });
            balanceByProduct.set(local.id, { productId: local.id, quantityOnHand: quantity(stockAfter), updatedAt: new Date() });
            if (stockAfter !== 0) await tx.insert(stockMovements).values({ productId: local.id, movementType: "adjustment", quantityDelta: quantity(stockAfter), quantityBefore: "0.000", quantityAfter: quantity(stockAfter), sourceType: "loyverse_import", sourceId: local.id, note: `Stock inicial importado desde Loyverse · ${availableStoreId}` });
            stockUpdated += 1;
          } else if (Math.abs(stockBefore - stockAfter) > 0.0005) {
            await tx.update(inventoryBalances).set({ quantityOnHand: quantity(stockAfter) }).where(eq(inventoryBalances.productId, local.id));
            await tx.insert(stockMovements).values({ productId: local.id, movementType: "adjustment", quantityDelta: quantity(stockAfter - stockBefore), quantityBefore: quantity(stockBefore), quantityAfter: quantity(stockAfter), sourceType: "loyverse_import", sourceId: local.id, note: `Stock sincronizado desde Loyverse · ${availableStoreId}` });
            balanceByProduct.set(local.id, { ...current, quantityOnHand: quantity(stockAfter) });
            stockUpdated += 1;
          }
        } catch (error) {
          const errorObject = error as { message?: string; cause?: { message?: string; code?: string } };
          const detail = [errorObject.message, errorObject.cause?.message, errorObject.cause?.code].filter(Boolean).join(" ");
          const fatal = /unknown column|doesn't exist|no such table|access denied|connect|econn|database.*(not found|does not exist)/i.test(detail);
          if (fatal) throw error;
          skipped += 1;
          if (skippedDetails.length < 20) skippedDetails.push(`${productName}: ${detail || "conflicto de datos"}`);
        }
      }
    }
    return { categoriesCreated, categoriesUpdated, categoriesRestored: 0, productsReassigned: 0, productsCreated, productsUpdated, stockUpdated, costVariantsAvailable, costsUpdated, costsPreserved, taxesAvailable: remoteTaxes.length, productsWithRemoteVat, productsUsingVatFallback, skipped, skippedDetails, storeId: availableStoreId };
  });
  return { success: true, ...imported };
}
