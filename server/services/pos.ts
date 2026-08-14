import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  cashMovements,
  cashSessions,
  categories,
  inventoryBalances,
  payments,
  products,
  purchaseInvoiceLines,
  purchaseInvoices,
  saleLines,
  sales,
  stockMovements,
  suppliers,
  vatTypes,
} from "../../drizzle/schema";
import { requireDb } from "../db";
import { issueFiscalTestRecord } from "./fiscal";

const toNumber = (value: string | number | null | undefined) => Number(value ?? 0);
const money = (value: number) => value.toFixed(2);
const quantity = (value: number) => value.toFixed(3);

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
  return database
    .select()
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
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
      vatTypeId: products.vatTypeId,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      imageUrl: products.imageUrl,
      unit: products.unit,
      salePrice: products.salePrice,
      vatRate: products.vatRate,
      cost: products.weightedAverageCost,
      minimumStock: products.minimumStock,
      isFeatured: products.isFeatured,
      isActive: products.isActive,
      stock: inventoryBalances.quantityOnHand,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
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
      vatTypeId: products.vatTypeId,
      name: products.name,
      sku: products.sku,
      imageUrl: products.imageUrl,
      unit: products.unit,
      salePrice: products.salePrice,
      vatRate: products.vatRate,
      stock: inventoryBalances.quantityOnHand,
      isFeatured: products.isFeatured,
      soldUnits,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
    .leftJoin(saleLines, eq(saleLines.productId, products.id))
    .leftJoin(sales, eq(sales.id, saleLines.saleId))
    .where(and(eq(products.isActive, true), eq(products.showInTpv, true)))
    .groupBy(products.id, categories.name, inventoryBalances.quantityOnHand)
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
}) {
  const database = requireDb();
  const initialStock = input.initialStock ?? 0;
  const result = await database.transaction(async (tx) => {
    let resolvedVatRate = input.vatRate ?? 7;
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
  lines: Array<{ productId: number; quantity: number }>;
  paymentMethod: "cash" | "card";
  receivedAmount?: number;
  terminalReference?: string;
  note?: string;
};

export async function checkout(input: CheckoutInput) {
  const database = requireDb();
  const groupedLines = new Map<number, number>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.productId) || !Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error("El ticket contiene una línea inválida.");
    }
    groupedLines.set(line.productId, (groupedLines.get(line.productId) ?? 0) + line.quantity);
  }
  if (groupedLines.size === 0) throw new Error("El ticket está vacío.");

  // La primera consulta o cobro posterior a las 07:00 abre automáticamente la nueva jornada.
  // Se reutiliza el mismo mecanismo para conservar el fondo contado en el cierre anterior.
  const activeSession = await getOrCreateCashSession();
  return database.transaction(async (tx) => {
    const session = await tx.select().from(cashSessions).where(eq(cashSessions.id, activeSession.id)).limit(1);
    const cashSession = session[0];
    if (!cashSession || cashSession.status !== "open") {
      throw new Error("La caja de esta jornada ya está cerrada. La siguiente se abrirá automáticamente a las 07:00.");
    }

    const productIds = [...groupedLines.keys()];
    const catalogRows = await tx
      .select({ product: products, balance: inventoryBalances })
      .from(products)
      .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
      .where(and(inArray(products.id, productIds), eq(products.isActive, true)));

    if (catalogRows.length !== productIds.length) {
      throw new Error("Uno o varios productos ya no están disponibles.");
    }

    const computedLines = catalogRows.map(({ product, balance }) => {
      const soldQuantity = groupedLines.get(product.id) ?? 0;
      const currentStock = toNumber(balance?.quantityOnHand);
      const unitPrice = toNumber(product.salePrice);
      const vatRate = toNumber(product.vatRate);
      const lineTotal = unitPrice * soldQuantity;
      const lineVat = lineTotal * (vatRate / (100 + vatRate));
      return {
        product,
        currentStock,
        soldQuantity,
        unitPrice,
        unitCost: toNumber(product.weightedAverageCost),
        vatRate,
        lineTotal,
        lineVat,
        lineSubtotal: lineTotal - lineVat,
      };
    });

    const subtotal = computedLines.reduce((sum, line) => sum + line.lineSubtotal, 0);
    const vatAmount = computedLines.reduce((sum, line) => sum + line.lineVat, 0);
    const totalAmount = computedLines.reduce((sum, line) => sum + line.lineTotal, 0);
    const receivedAmount = input.paymentMethod === "cash" ? (input.receivedAmount ?? totalAmount) : totalAmount;
    if (receivedAmount < totalAmount) throw new Error("El importe recibido es menor que el total del ticket.");
    const changeAmount = input.paymentMethod === "cash" ? receivedAmount - totalAmount : 0;
    const issuedAt = new Date();
    const saleNumber = `SS-${cashSession.businessDate.replaceAll("-", "")}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;

    const insertedSale = await tx.insert(sales).values({
      saleNumber,
      cashSessionId: cashSession.id,
      subtotal: money(subtotal),
      vatAmount: money(vatAmount),
      totalAmount: money(totalAmount),
      note: input.note?.trim() || null,
      createdAt: issuedAt,
    });
    const saleId = Number(insertedSale[0].insertId);

    for (const line of computedLines) {
      const quantityAfter = line.currentStock - line.soldQuantity;
      await tx.insert(saleLines).values({
        saleId,
        productId: line.product.id,
        productName: line.product.name,
        sku: line.product.sku,
        quantity: quantity(line.soldQuantity),
        unitPrice: money(line.unitPrice),
        unitCost: money(line.unitCost),
        vatRate: money(line.vatRate),
        lineSubtotal: money(line.lineSubtotal),
        lineVat: money(line.lineVat),
        lineTotal: money(line.lineTotal),
      });
      await tx
        .update(inventoryBalances)
        .set({ quantityOnHand: quantity(quantityAfter) })
        .where(eq(inventoryBalances.productId, line.product.id));
      await tx.insert(stockMovements).values({
        productId: line.product.id,
        movementType: "sale",
        quantityDelta: quantity(-line.soldQuantity),
        quantityBefore: quantity(line.currentStock),
        quantityAfter: quantity(quantityAfter),
        unitCost: money(line.unitCost),
        sourceType: "sale",
        sourceId: saleId,
        note: `Venta ${saleNumber}`,
      });
    }

    await tx.insert(payments).values({
      saleId,
      method: input.paymentMethod,
      amount: money(totalAmount),
      receivedAmount: money(receivedAmount),
      changeAmount: money(changeAmount),
      terminalReference: input.paymentMethod === "card" ? input.terminalReference?.trim() || null : null,
    });

    if (input.paymentMethod === "cash") {
      await tx.insert(cashMovements).values({
        cashSessionId: cashSession.id,
        movementType: "cash_sale",
        amount: money(totalAmount),
        sourceType: "sale",
        sourceId: saleId,
        note: `Venta ${saleNumber}`,
      });
    } else {
      await tx
        .update(cashSessions)
        .set({ cardTotal: money(toNumber(cashSession.cardTotal) + totalAmount) })
        .where(eq(cashSessions.id, cashSession.id));
    }

    const fiscal = await issueFiscalTestRecord(tx, {
      saleId,
      issuedAt,
      subtotal,
      vatAmount,
      totalAmount,
      paymentMethod: input.paymentMethod,
      lines: computedLines.map((line) => ({
        productName: line.product.name,
        sku: line.product.sku,
        quantity: line.soldQuantity,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        lineSubtotal: line.lineSubtotal,
        lineVat: line.lineVat,
        lineTotal: line.lineTotal,
      })),
    });

    return {
      saleId,
      saleNumber,
      fiscalInvoiceNumber: fiscal.fiscalInvoice.invoiceNumber,
      subtotal: money(subtotal),
      vatAmount: money(vatAmount),
      totalAmount: money(totalAmount),
      changeAmount: money(changeAmount),
      paymentMethod: input.paymentMethod,
      createdAt: new Date().toISOString(),
    };
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

export async function createCategory(input: { name: string; color?: string; imageUrl?: string; iconName?: string; sortOrder?: number; isFeatured?: boolean }) {
  const database = requireDb();
  const lastOrder = await database.select({ maxOrder: sql<number>`coalesce(max(${categories.sortOrder}), -1)` }).from(categories);
  const inserted = await database.insert(categories).values({
    name: input.name.trim(),
    color: input.color ?? "#155E75",
    imageUrl: input.imageUrl?.trim() || null,
    iconName: input.iconName?.trim() || "Package",
    sortOrder: input.sortOrder ?? Number(lastOrder[0]?.maxOrder ?? -1) + 1,
    isFeatured: input.isFeatured ?? false,
  });
  return { id: Number(inserted[0].insertId) };
}

export async function updateCategory(input: { id: number; name?: string; color?: string; imageUrl?: string | null; iconName?: string; sortOrder?: number; isFeatured?: boolean; isActive?: boolean }) {
  const database = requireDb();
  const updateSet: Partial<typeof categories.$inferInsert> = {};
  if (input.name !== undefined) updateSet.name = input.name.trim();
  if (input.color !== undefined) updateSet.color = input.color;
  if (input.imageUrl !== undefined) updateSet.imageUrl = input.imageUrl?.trim() || null;
  if (input.iconName !== undefined) updateSet.iconName = input.iconName.trim() || "Package";
  if (input.sortOrder !== undefined) updateSet.sortOrder = input.sortOrder;
  if (input.isFeatured !== undefined) updateSet.isFeatured = input.isFeatured;
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

export async function getReports(input: { period?: string; from?: string; to?: string } = {}) {
  const database = requireDb();
  const period = input.period ?? "quarter";
  const range = reportRange(period, input.from, input.to);
  const salesRows = await database
    .select({ id: sales.id, businessDate: cashSessions.businessDate, totalAmount: sales.totalAmount, subtotal: sales.subtotal, vatAmount: sales.vatAmount, createdAt: sales.createdAt, method: payments.method })
    .from(sales)
    .innerJoin(cashSessions, eq(cashSessions.id, sales.cashSessionId))
    .leftJoin(payments, eq(payments.saleId, sales.id))
    .where(and(eq(sales.status, "completed"), sql`${cashSessions.businessDate} >= ${range.from}`, sql`${cashSessions.businessDate} <= ${range.to}`))
    .orderBy(asc(cashSessions.businessDate), asc(sales.createdAt));
  const lineRows = await database
    .select({ productId: saleLines.productId, productName: saleLines.productName, quantity: saleLines.quantity, lineTotal: saleLines.lineTotal, lineVat: saleLines.lineVat, unitCost: saleLines.unitCost, businessDate: cashSessions.businessDate, categoryName: categories.name })
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
  const groupKey = (date: string) => period === "day" || period === "week" || period === "custom" ? date : date.slice(0, 7);
  const seriesMap = new Map<string, { total: number; tickets: number; cash: number; card: number }>();
  for (const row of salesRows) {
    const key = groupKey(row.businessDate);
    const current = seriesMap.get(key) ?? { total: 0, tickets: 0, cash: 0, card: 0 };
    current.total += toNumber(row.totalAmount); current.tickets += 1;
    if (row.method === "cash") current.cash += toNumber(row.totalAmount);
    if (row.method === "card") current.card += toNumber(row.totalAmount);
    seriesMap.set(key, current);
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
    period, from: range.from, to: range.to,
    totals: { totalSold: money(totalSold), subtotal: money(subtotal), vat: money(vat), cash: money(cash), card: money(card), cost: money(totalCost), margin: money(totalSold - totalCost), tickets: salesRows.length },
    series: [...seriesMap.entries()].map(([label, row]) => ({ label, ...row, total: money(row.total), cash: money(row.cash), card: money(row.card) })),
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
  return { ...sale[0].sale, payment: sale[0].payment, lines };
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
