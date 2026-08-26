import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "./db";
import {
  checkout,
  closeCurrentCashSession,
  createProduct,
  getCurrentCashSummary,
  getFeaturedProducts,
  getRecentSales,
  getDailyAnalysis,
  getReports,
  getSaleDetails,
  listVatTypes,
  listCatalog,
  listCategories,
} from "./services/pos";

const checkoutSchema = z.object({
  lines: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().nonnegative(), unitPrice: z.number().nonnegative().optional(), discountPercent: z.number().min(0).max(100).optional(), pricingMode: z.enum(["normal", "discount", "cost", "free", "promotion"]).optional(), promotionId: z.number().int().positive().optional(), promotionSelections: z.array(z.number().int().positive()).max(3).optional() })).min(1),
  paymentMethod: z.enum(["cash", "card"]),
  receivedAmount: z.number().nonnegative().optional(),
  terminalReference: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});

const mediaPathSchema = z.string().max(2000).refine((value) => value.startsWith("/") || /^https?:\/\//i.test(value), "La imagen debe ser una ruta local o una URL HTTP válida.");

const createProductSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(1).max(255),
  salePrice: z.number().nonnegative(),
  vatRate: z.number().min(0).max(100).optional(),
  vatTypeId: z.number().int().positive().optional(),
  initialStock: z.number().min(0).optional(),
  minimumStock: z.number().min(0).optional(),
  sku: z.string().trim().max(100).optional(),
  barcode: z.string().trim().max(100).optional(),
  imageUrl: mediaPathSchema.optional(),
  imageZoom: z.number().min(1).max(3).optional(),
  imagePositionX: z.number().min(0).max(100).optional(),
  imagePositionY: z.number().min(0).max(100).optional(),
  primarySupplierId: z.number().int().positive().optional(),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => issue.message).join(". "));
  }
  return result.data;
}

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "sweet-salty-pos", timestamp: new Date().toISOString() });
});

apiRouter.get("/categories", async (_req, res, next) => {
  try {
    res.json(await listCategories());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/catalog", async (req, res, next) => {
  try {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const order = req.query.order === "alphabetical" ? "alphabetical" : "popular";
    res.json(await listCatalog(categoryId, order));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/promotions/:id", async (req, res, next) => {
  try {
    const { getPromotionDetails } = await import("./services/pos");
    res.json(await getPromotionDetails(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/catalog/featured", async (_req, res, next) => {
  try {
    res.json(await getFeaturedProducts());
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/products", async (req, res, next) => {
  try {
    const input = parseBody(createProductSchema, req.body);
    res.status(201).json(await createProduct(input));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/checkout", async (req, res, next) => {
  try {
    const input = parseBody(checkoutSchema, req.body);
    res.status(201).json(await checkout(input));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/sales/:id", async (req, res, next) => {
  try {
    const { getCombinedReceiptDetails } = await import("./services/loyverse");
    res.json(await getCombinedReceiptDetails(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/sales", async (req, res, next) => {
  try {
    const requestedLimit = req.query.limit ? Number(req.query.limit) : 20;
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 20;
    const { getCombinedRecentSales } = await import("./services/loyverse");
    res.json(await getCombinedRecentSales(limit));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/email/status", async (_req, res, next) => {
  try {
    const { getReceiptEmailStatus } = await import("./services/email");
    res.json(await getReceiptEmailStatus());
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/sales/:id/email", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ recipient: z.string().email() }), req.body);
    const { sendSaleReceiptEmail } = await import("./services/email");
    res.json(await sendSaleReceiptEmail({ saleId: Number(req.params.id), recipient: input.recipient }));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/analysis/daily", async (_req, res, next) => {
  try {
    const { getCombinedDailyAnalysis } = await import("./services/loyverse");
    res.json(await getCombinedDailyAnalysis());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/reports", async (req, res, next) => {
  try {
    const period = typeof req.query.period === "string" ? req.query.period : "quarter";
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const source = req.query.source === "loyverse" || req.query.source === "local" ? req.query.source : "all";
    const { getCombinedReports } = await import("./services/loyverse");
    res.json(await getCombinedReports({ period, from, to, source }));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/fiscal/readiness", async (_req, res, next) => {
  try {
    const { getFiscalReadinessDashboard } = await import("./services/fiscal");
    res.json(await getFiscalReadinessDashboard());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/fiscal/verify-chain", async (_req, res, next) => {
  try {
    const { verifyFiscalChain } = await import("./services/fiscal");
    res.json(await verifyFiscalChain());
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/fiscal/invoices/:id/cancel", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ reason: z.string().trim().min(3).max(500) }), req.body);
    const { cancelFiscalTestInvoice } = await import("./services/fiscal");
    res.json(await cancelFiscalTestInvoice({ fiscalInvoiceId: Number(req.params.id), reason: input.reason }));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/fiscal/invoices/:id/rectify", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ reason: z.string().trim().min(3).max(500), correctedTotal: z.number().nonnegative().optional() }), req.body);
    const { rectifyFiscalTestInvoice } = await import("./services/fiscal");
    res.json(await rectifyFiscalTestInvoice({ fiscalInvoiceId: Number(req.params.id), reason: input.reason, correctedTotal: input.correctedTotal }));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/fiscal/export", async (_req, res, next) => {
  try {
    const database = requireDb();
    const { fiscalInvoices, fiscalRecords, fiscalProfiles } = await import("../drizzle/schema");
    const profile = await database.select().from(fiscalProfiles).where(eq(fiscalProfiles.isActive, true)).limit(1);
    const records = await database.select({ invoice: fiscalInvoices, record: fiscalRecords }).from(fiscalRecords).innerJoin(fiscalInvoices, eq(fiscalInvoices.id, fiscalRecords.fiscalInvoiceId)).orderBy(asc(fiscalRecords.chainPosition));
    res.setHeader("Content-Disposition", `attachment; filename=verifactu-preparation-${new Date().toISOString().slice(0, 10)}.json`);
    res.json({ mode: "test", aeatSubmission: false, profile: profile[0] ?? null, records, exportedAt: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/fiscal/audit", async (_req, res, next) => {
  try {
    const database = requireDb();
    const { auditLog } = await import("../drizzle/schema");
    res.json(await database.select().from(auditLog).where(eq(auditLog.entityType, "fiscal_invoice")).orderBy(asc(auditLog.createdAt)).limit(200));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/cash/current", async (_req, res, next) => {
  try {
    res.json(await getCurrentCashSummary());
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/cash/close", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ countedCash: z.number().nonnegative().optional(), countedCard: z.number().nonnegative().optional(), denominationCounts: z.record(z.string(), z.number().nonnegative()).optional(), notes: z.string().max(1000).optional() }), req.body);
    res.json(await closeCurrentCashSession(input));
  } catch (error) {
    next(error);
  }
});


apiRouter.get("/admin/vat-types", async (_req, res, next) => {
  try {
    res.json(await listVatTypes());
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/vat-types", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ name: z.string().trim().min(1).max(100), rate: z.number().min(0).max(100), sortOrder: z.number().int().optional() }), req.body);
    const { createVatType } = await import("./services/pos");
    res.status(201).json(await createVatType(input));
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/admin/vat-types/:id", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ name: z.string().trim().min(1).max(100).optional(), rate: z.number().min(0).max(100).optional(), sortOrder: z.number().int().optional(), isActive: z.boolean().optional() }), req.body);
    const { updateVatType } = await import("./services/pos");
    res.json(await updateVatType({ id: Number(req.params.id), ...input }));
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/admin/settings/loyverse", async (req, res, next) => {
  try {
    const input = parseBody(z.object({
      apiBaseUrl: z.preprocess((value) => value === "" ? null : value, z.string().trim().url().max(255).nullable().optional()),
      apiToken: z.string().max(255).optional(),
      clearToken: z.boolean().optional(),
      storeId: z.preprocess((value) => value === "" ? null : value, z.string().trim().max(64).nullable().optional()),
    }), req.body);
    const { updateLoyverseSettings } = await import("./services/pos");
    res.json(await updateLoyverseSettings(input));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/loyverse/test", async (_req, res, next) => {
  try {
    const { testLoyverseConnection } = await import("./services/loyverse");
    res.json(await testLoyverseConnection());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/loyverse/status", async (_req, res, next) => {
  try {
    const { getLoyverseStatus } = await import("./services/loyverse");
    res.json(await getLoyverseStatus());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/loyverse/dashboard", async (req, res, next) => {
  try {
    const parseDate = (value: unknown) => typeof value === "string" && value ? new Date(value) : undefined;
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from && Number.isNaN(from.getTime())) throw new Error("La fecha inicial de Loyverse no es válida.");
    if (to && Number.isNaN(to.getTime())) throw new Error("La fecha final de Loyverse no es válida.");
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : undefined;
    const { getLoyverseDashboard } = await import("./services/loyverse");
    res.json(await getLoyverseDashboard({ from, to }, storeId));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/loyverse/sync/catalog", async (_req, res, next) => {
  try {
    const { syncLoyverseCatalog } = await import("./services/loyverse");
    res.json(await syncLoyverseCatalog());
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/loyverse/import/catalog", async (req, res, next) => {
  try {
    const storeId = typeof req.body?.storeId === "string" && req.body.storeId.trim() ? req.body.storeId.trim() : undefined;
    const { importLoyverseCatalogToOperational } = await import("./services/pos");
    res.json(await importLoyverseCatalogToOperational(storeId));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/loyverse/sales-range", async (req, res, next) => {
  try {
    const storeId = typeof req.query.storeId === "string" && req.query.storeId.trim() ? req.query.storeId.trim() : undefined;
    const { getLoyverseSalesRange } = await import("./services/loyverse");
    res.json(await getLoyverseSalesRange(storeId));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/loyverse/sync/sales", async (req, res, next) => {
  try {
    const parseDate = (value: unknown) => typeof value === "string" && value ? new Date(value) : undefined;
    const from = parseDate(req.body?.from);
    const to = parseDate(req.body?.to);
    if (from && Number.isNaN(from.getTime())) throw new Error("La fecha inicial de Loyverse no es válida.");
    if (to && Number.isNaN(to.getTime())) throw new Error("La fecha final de Loyverse no es válida.");
    const storeId = typeof req.body?.storeId === "string" && req.body.storeId.trim() ? req.body.storeId.trim() : undefined;
    const { syncLoyverseSales } = await import("./services/loyverse");
    res.json(await syncLoyverseSales({ from, to }, storeId));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/loyverse/sync", async (req, res, next) => {
  try {
    const parseDate = (value: unknown) => typeof value === "string" && value ? new Date(value) : undefined;
    const from = parseDate(req.body?.from);
    const to = parseDate(req.body?.to);
    if (from && Number.isNaN(from.getTime())) throw new Error("La fecha inicial de Loyverse no es válida.");
    if (to && Number.isNaN(to.getTime())) throw new Error("La fecha final de Loyverse no es válida.");
    const { syncLoyverseAll } = await import("./services/loyverse");
    res.json(await syncLoyverseAll({ from, to }));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/settings", async (_req, res, next) => {
  try {
    const { getPosSettings } = await import("./services/pos");
    res.json(await getPosSettings());
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/admin/settings/smtp", async (req, res, next) => {
  try {
    const input = parseBody(z.object({
      smtpHost: z.string().trim().max(255).nullable().optional(),
      smtpPort: z.number().int().min(1).max(65535).optional(),
      smtpSecure: z.boolean().optional(),
      smtpUser: z.string().trim().max(320).nullable().optional(),
      smtpPassword: z.string().max(255).optional(),
      clearPassword: z.boolean().optional(),
      smtpFrom: z.preprocess((value) => value === "" ? null : value, z.string().trim().email().max(320).nullable().optional()),
    }), req.body);
    const { updateSmtpSettings } = await import("./services/pos");
    res.json(await updateSmtpSettings(input));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/settings/smtp/test", async (_req, res, next) => {
  try {
    const { verifySmtpConnection } = await import("./services/email");
    res.json(await verifySmtpConnection());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/products", async (_req, res, next) => {
  try {
    const { listAdminProducts } = await import("./services/pos");
    res.json(await listAdminProducts());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/categories", async (_req, res, next) => {
  try {
    const { listAdminCategories } = await import("./services/pos");
    res.json(await listAdminCategories());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/promotions", async (_req, res, next) => {
  try {
    const { listPromotions } = await import("./services/pos");
    res.json(await listPromotions());
  } catch (error) {
    next(error);
  }
});

const promotionSchema = z.object({ productId: z.number().int().positive(), name: z.string().trim().min(1).max(160), comboPrice: z.number().nonnegative(), slots: z.array(z.object({ label: z.string().trim().min(1).max(100), categoryId: z.number().int().positive(), productIds: z.array(z.number().int().positive()).min(1) })).min(1).max(3) });

apiRouter.post("/admin/promotions", async (req, res, next) => {
  try {
    const { createPromotion } = await import("./services/pos");
    res.status(201).json(await createPromotion(parseBody(promotionSchema, req.body)));
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/admin/promotions/:id", async (req, res, next) => {
  try {
    const { updatePromotion } = await import("./services/pos");
    res.json(await updatePromotion({ id: Number(req.params.id), ...parseBody(promotionSchema, req.body) }));
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/admin/promotions/:id", async (req, res, next) => {
  try {
    const { deactivatePromotion } = await import("./services/pos");
    res.json(await deactivatePromotion(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/categories", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ name: z.string().trim().min(1).max(100), color: z.string().regex(/^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/).optional(), imageUrl: mediaPathSchema.optional(), iconName: z.string().trim().max(64).optional(), sortOrder: z.number().int().optional(), isFeatured: z.boolean().optional(), isPromotion: z.boolean().optional(), parentCategoryId: z.number().int().positive().nullable().optional() }), req.body);
    const { createCategory } = await import("./services/pos");
    res.status(201).json(await createCategory(input));
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/admin/categories/:id", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ name: z.string().trim().min(1).max(100).optional(), color: z.string().regex(/^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/).optional(), imageUrl: mediaPathSchema.nullable().optional(), iconName: z.string().trim().max(64).optional(), sortOrder: z.number().int().optional(), isFeatured: z.boolean().optional(), isPromotion: z.boolean().optional(), isActive: z.boolean().optional(), parentCategoryId: z.number().int().positive().nullable().optional() }), req.body);
    const { updateCategory } = await import("./services/pos");
    res.json(await updateCategory({ id: Number(req.params.id), ...input }));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/categories/reorder", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ items: z.array(z.object({ id: z.number().int().positive(), sortOrder: z.number().int().nonnegative() })).min(1) }), req.body);
    const { reorderCategories } = await import("./services/pos");
    res.json(await reorderCategories(input.items));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/category-images", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ fileData: z.string().min(20), fileName: z.string().min(1).max(255), contentType: z.string() }), req.body);
    const { saveCategoryImage } = await import("./services/uploads");
    res.status(201).json(await saveCategoryImage(input));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/products/repair-vat", async (_req, res, next) => {
  try {
    const { repairImportedVatRates } = await import("./services/pos");
    res.json(await repairImportedVatRates());
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/admin/products/:id", async (req, res, next) => {
  try {
    const input = parseBody(z.object({
      name: z.string().trim().min(1).max(255).optional(),
      categoryId: z.number().int().positive().optional(),
      salePrice: z.number().nonnegative().optional(),
      minimumStock: z.number().min(0).optional(),
      isFeatured: z.boolean().optional(),
      showInTpv: z.boolean().optional(),
      isActive: z.boolean().optional(),
      imageUrl: mediaPathSchema.nullable().optional(),
      sku: z.string().trim().max(100).nullable().optional(),
      barcode: z.string().trim().max(100).nullable().optional(),
      vatRate: z.number().min(0).max(100).optional(),
      vatTypeId: z.number().int().positive().nullable().optional(),
      lastPurchaseCost: z.number().nonnegative().optional(),
      weightedAverageCost: z.number().nonnegative().optional(),
      imageZoom: z.number().min(1).max(3).optional(),
      imagePositionX: z.number().min(0).max(100).optional(),
      imagePositionY: z.number().min(0).max(100).optional(),
    }), req.body);
    const { updateProduct } = await import("./services/pos");
    res.json(await updateProduct({ id: Number(req.params.id), ...input }));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/inventory/adjust", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ productId: z.number().int().positive(), newQuantity: z.number().min(0), note: z.string().max(255).optional() }), req.body);
    const { adjustInventory } = await import("./services/pos");
    res.json(await adjustInventory(input));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/suppliers", async (_req, res, next) => {
  try {
    const { listAdminSuppliers } = await import("./services/pos");
    res.json(await listAdminSuppliers());
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/suppliers", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ name: z.string().trim().min(1).max(255), legalName: z.string().max(255).optional(), taxId: z.string().max(64).optional(), phone: z.string().max(50).optional(), email: z.preprocess((value) => value === "" ? undefined : value, z.string().email().max(320).optional()), notes: z.string().max(500).optional() }), req.body);
    const { createSupplier } = await import("./services/pos");
    res.status(201).json(await createSupplier(input));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/reports/sales-by-product", async (_req, res, next) => {
  try {
    const { getCombinedSalesByProduct } = await import("./services/loyverse");
    res.json(await getCombinedSalesByProduct());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/purchase-invoices", async (_req, res, next) => {
  try {
    const { listPurchaseInvoices } = await import("./services/pos");
    res.json(await listPurchaseInvoices());
  } catch (error) {
    next(error);
  }
});


apiRouter.post("/admin/purchase-invoices", async (req, res, next) => {
  try {
    const input = parseBody(z.object({
      supplierId: z.number().int().positive().optional(),
      detectedSupplierName: z.string().max(255).optional(),
      invoiceNumber: z.string().max(100).optional(),
      invoiceDate: z.string().optional(),
      subtotal: z.number().nonnegative().optional(),
      vatAmount: z.number().nonnegative().optional(),
      totalAmount: z.number().nonnegative().optional(),
      documentUrl: mediaPathSchema.optional(),
      documentName: z.string().max(255).optional(),
      ocrData: z.unknown().optional(),
      notes: z.string().max(1000).optional(),
      lines: z.array(z.object({ productId: z.number().int().positive().optional(), detectedName: z.string().max(255).optional(), supplierReference: z.string().max(100).optional(), quantity: z.number().positive(), unitCost: z.number().nonnegative(), vatRate: z.number().min(0).max(100).optional(), lineTotal: z.number().nonnegative() })).min(1),
    }), req.body);
    const { createPurchaseInvoice } = await import("./services/pos");
    res.status(201).json(await createPurchaseInvoice(input));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/purchase-invoices/:id/receive", async (req, res, next) => {
  try {
    const input = parseBody(z.object({
      lineMappings: z.array(z.object({ lineId: z.number().int().positive(), productId: z.number().int().positive(), quantity: z.number().positive(), unitCost: z.number().nonnegative(), lineTotal: z.number().nonnegative() })).optional(),
    }), req.body ?? {});
    const { receivePurchaseInvoice } = await import("./services/pos");
    res.json(await receivePurchaseInvoice(Number(req.params.id), input.lineMappings));
  } catch (error) {
    next(error);
  }
});


apiRouter.post("/admin/purchase-invoices/recognize", async (req, res, next) => {
  try {
    const input = parseBody(z.object({
      fileData: z.string().min(20),
      fileName: z.string().min(1).max(255),
      contentType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
    }), req.body);
    const { recognizeInvoiceFile } = await import("./services/invoice-ai");
    const result = await recognizeInvoiceFile(input);
    const { createPurchaseInvoice } = await import("./services/pos");
    const draft = await createPurchaseInvoice({
      detectedSupplierName: result.data.supplierName ?? undefined,
      invoiceNumber: result.data.invoiceNumber ?? undefined,
      invoiceDate: result.data.invoiceDate ?? undefined,
      subtotal: result.data.subtotal ?? 0,
      vatAmount: result.data.vatAmount ?? 0,
      totalAmount: result.data.totalAmount ?? 0,
      documentUrl: result.localUrl,
      documentName: result.fileName,
      ocrData: result.data,
      lines: result.data.lines.map((line) => ({
        detectedName: line.description,
        supplierReference: line.supplierReference ?? undefined,
        quantity: line.quantity ?? 1,
        unitCost: line.unitCost ?? 0,
        vatRate: result.data.vatRate ?? 7,
        lineTotal: line.lineTotal ?? 0,
      })),
    });
    res.json({ ...result, draft });
  } catch (error) {
    next(error);
  }
});


apiRouter.post("/admin/product-images", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ fileData: z.string().min(20), fileName: z.string().min(1).max(255), contentType: z.string() }), req.body);
    const { saveProductImage } = await import("./services/uploads");
    res.status(201).json(await saveProductImage(input));
  } catch (error) {
    next(error);
  }
});


apiRouter.post("/admin/invoice-documents", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ fileData: z.string().min(20), fileName: z.string().min(1).max(255), contentType: z.string() }), req.body);
    const { saveInvoiceDocument } = await import("./services/uploads");
    res.status(201).json(await saveInvoiceDocument(input));
  } catch (error) {
    next(error);
  }
});


apiRouter.delete("/admin/products/:id", async (req, res, next) => {
  try {
    const { deactivateProduct } = await import("./services/pos");
    res.json(await deactivateProduct(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/admin/suppliers/:id", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ name: z.string().trim().min(1).max(255).optional(), legalName: z.string().trim().max(255).nullable().optional(), taxId: z.string().trim().max(100).nullable().optional(), phone: z.string().trim().max(100).nullable().optional(), email: z.string().trim().email().nullable().optional(), notes: z.string().trim().max(2000).nullable().optional() }), req.body);
    const { updateSupplier } = await import("./services/pos");
    res.json(await updateSupplier({ id: Number(req.params.id), ...input }));
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/admin/suppliers/:id", async (req, res, next) => {
  try {
    const { deactivateSupplier } = await import("./services/pos");
    res.json(await deactivateSupplier(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/purchase-invoices/:id/void", async (req, res, next) => {
  try {
    const { voidPurchaseInvoice } = await import("./services/pos");
    res.json(await voidPurchaseInvoice(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});


apiRouter.get("/admin/cash-sessions", async (req, res, next) => {
  try {
    const { listCashSessions } = await import("./services/pos");
    res.json(await listCashSessions(Number(req.query.limit ?? 60)));
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/admin/cash-sessions/:id", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ countedCash: z.number().nonnegative(), countedCard: z.number().nonnegative(), denominationCounts: z.record(z.string(), z.number().nonnegative()).optional(), notes: z.string().max(1000).nullable().optional() }), req.body);
    const { updateClosedCashSession } = await import("./services/pos");
    res.json(await updateClosedCashSession({ id: Number(req.params.id), ...input }));
  } catch (error) {
    next(error);
  }
});


apiRouter.get("/hardware/drawer/status", async (_req, res, next) => {
  try {
    const { probeDrawerBridge } = await import("./services/hardware");
    res.json(await probeDrawerBridge());
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/hardware/drawer/open", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ reason: z.enum(["cash_sale", "manual"]).optional() }), req.body ?? {});
    const { openCashDrawer } = await import("./services/hardware");
    res.json(await openCashDrawer({ reason: input.reason }));
  } catch (error) {
    next(error);
  }
});
