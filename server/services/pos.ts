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
} from "../../drizzle/schema";
import { requireDb } from "../db";

const toNumber = (value: string | number | null | undefined) => Number(value ?? 0);
const money = (value: number) => value.toFixed(2);
const quantity = (value: number) => value.toFixed(3);

export function getBusinessDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.BUSINESS_TIMEZONE ?? "Atlantic/Canary",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const values = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
  const conditions = [eq(products.isActive, true)];
  if (categoryId) conditions.push(eq(products.categoryId, categoryId));

  const rows = await database
    .select({
      id: products.id,
      categoryId: products.categoryId,
      categoryName: categories.name,
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
  return database
    .select({
      id: products.id,
      categoryId: products.categoryId,
      categoryName: categories.name,
      name: products.name,
      sku: products.sku,
      imageUrl: products.imageUrl,
      unit: products.unit,
      salePrice: products.salePrice,
      vatRate: products.vatRate,
      stock: inventoryBalances.quantityOnHand,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
    .where(and(eq(products.isActive, true), eq(products.isFeatured, true)))
    .orderBy(asc(products.name));
}

export async function createProduct(input: {
  categoryId: number;
  name: string;
  salePrice: number;
  vatRate?: number;
  initialStock?: number;
  minimumStock?: number;
  sku?: string;
  imageUrl?: string;
  primarySupplierId?: number;
}) {
  const database = requireDb();
  const initialStock = input.initialStock ?? 0;
  const result = await database.transaction(async (tx) => {
    const inserted = await tx.insert(products).values({
      categoryId: input.categoryId,
      name: input.name.trim(),
      salePrice: money(input.salePrice),
      vatRate: money(input.vatRate ?? 7),
      minimumStock: quantity(input.minimumStock ?? 0),
      sku: input.sku?.trim() || null,
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

  return database.transaction(async (tx) => {
    const businessDate = getBusinessDate();
    let session = await tx.select().from(cashSessions).where(eq(cashSessions.businessDate, businessDate)).limit(1);
    if (!session[0]) {
      await tx.insert(cashSessions).values({ businessDate, openingFloat: "0.00" });
      session = await tx.select().from(cashSessions).where(eq(cashSessions.businessDate, businessDate)).limit(1);
    }
    const cashSession = session[0];
    if (!cashSession || cashSession.status !== "open") {
      throw new Error("La caja diaria está cerrada. Abre una nueva caja antes de cobrar.");
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
      if (currentStock < soldQuantity) {
        throw new Error(`Stock insuficiente para «${product.name}». Disponible: ${currentStock}.`);
      }
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
    const saleNumber = `SS-${businessDate.replaceAll("-", "")}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;

    const insertedSale = await tx.insert(sales).values({
      saleNumber,
      cashSessionId: cashSession.id,
      subtotal: money(subtotal),
      vatAmount: money(vatAmount),
      totalAmount: money(totalAmount),
      note: input.note?.trim() || null,
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

    return {
      saleId,
      saleNumber,
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
  const expectedCash = toNumber(session.openingFloat) + toNumber(result[0]?.total);
  return { ...session, expectedCash: money(expectedCash) };
}

export async function closeCurrentCashSession(countedCash: number, notes?: string) {
  const database = requireDb();
  const summary = await getCurrentCashSummary();
  if (summary.status !== "open") throw new Error("La caja de hoy ya está cerrada.");
  const difference = countedCash - toNumber(summary.expectedCash);
  await database
    .update(cashSessions)
    .set({
      countedCash: money(countedCash),
      expectedCash: summary.expectedCash,
      difference: money(difference),
      status: "closed",
      closedAt: new Date(),
      notes: notes?.trim() || null,
    })
    .where(eq(cashSessions.id, summary.id));
  return { ...summary, countedCash: money(countedCash), difference: money(difference), status: "closed" as const };
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
      salePrice: products.salePrice,
      vatRate: products.vatRate,
      lastPurchaseCost: products.lastPurchaseCost,
      weightedAverageCost: products.weightedAverageCost,
      minimumStock: products.minimumStock,
      isFeatured: products.isFeatured,
      imageUrl: products.imageUrl,
      stock: inventoryBalances.quantityOnHand,
      isActive: products.isActive,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(inventoryBalances, eq(inventoryBalances.productId, products.id))
    .orderBy(asc(products.name));
}

export async function createCategory(input: { name: string; color?: string; sortOrder?: number; isFeatured?: boolean }) {
  const database = requireDb();
  const inserted = await database.insert(categories).values({
    name: input.name.trim(),
    color: input.color ?? "#155E75",
    sortOrder: input.sortOrder ?? 0,
    isFeatured: input.isFeatured ?? false,
  });
  return { id: Number(inserted[0].insertId) };
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
}) {
  const database = requireDb();
  const updateSet: Record<string, unknown> = {};
  if (input.name !== undefined) updateSet.name = input.name.trim();
  if (input.categoryId !== undefined) updateSet.categoryId = input.categoryId;
  if (input.salePrice !== undefined) updateSet.salePrice = money(input.salePrice);
  if (input.minimumStock !== undefined) updateSet.minimumStock = quantity(input.minimumStock);
  if (input.isFeatured !== undefined) updateSet.isFeatured = input.isFeatured;
  if (input.isActive !== undefined) updateSet.isActive = input.isActive;
  if (input.imageUrl !== undefined) updateSet.imageUrl = input.imageUrl?.trim() || null;
  if (input.sku !== undefined) updateSet.sku = input.sku?.trim() || null;
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
