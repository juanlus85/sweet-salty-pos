import { Router } from "express";
import { z } from "zod";
import {
  checkout,
  closeCurrentCashSession,
  createProduct,
  getCurrentCashSummary,
  getFeaturedProducts,
  getRecentSales,
  getDailyAnalysis,
  getSaleDetails,
  listVatTypes,
  listCatalog,
  listCategories,
} from "./services/pos";

const checkoutSchema = z.object({
  lines: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().positive() })).min(1),
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
    res.json(await getSaleDetails(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/sales", async (req, res, next) => {
  try {
    const requestedLimit = req.query.limit ? Number(req.query.limit) : 20;
    res.json(await getRecentSales(Number.isFinite(requestedLimit) ? requestedLimit : 20));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/analysis/daily", async (_req, res, next) => {
  try {
    res.json(await getDailyAnalysis());
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

apiRouter.post("/admin/categories", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ name: z.string().trim().min(1).max(100), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(), imageUrl: mediaPathSchema.optional(), iconName: z.string().trim().max(64).optional(), sortOrder: z.number().int().optional(), isFeatured: z.boolean().optional() }), req.body);
    const { createCategory } = await import("./services/pos");
    res.status(201).json(await createCategory(input));
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/admin/categories/:id", async (req, res, next) => {
  try {
    const input = parseBody(z.object({ name: z.string().trim().min(1).max(100).optional(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(), imageUrl: mediaPathSchema.nullable().optional(), iconName: z.string().trim().max(64).optional(), sortOrder: z.number().int().optional(), isFeatured: z.boolean().optional(), isActive: z.boolean().optional() }), req.body);
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

apiRouter.patch("/admin/products/:id", async (req, res, next) => {
  try {
    const input = parseBody(z.object({
      name: z.string().trim().min(1).max(255).optional(),
      categoryId: z.number().int().positive().optional(),
      salePrice: z.number().nonnegative().optional(),
      minimumStock: z.number().min(0).optional(),
      isFeatured: z.boolean().optional(),
      isActive: z.boolean().optional(),
      imageUrl: mediaPathSchema.nullable().optional(),
      sku: z.string().trim().max(100).nullable().optional(),
      barcode: z.string().trim().max(100).nullable().optional(),
      vatRate: z.number().min(0).max(100).optional(),
      vatTypeId: z.number().int().positive().nullable().optional(),
      lastPurchaseCost: z.number().nonnegative().optional(),
      weightedAverageCost: z.number().nonnegative().optional(),
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
    const input = parseBody(z.object({ name: z.string().trim().min(1).max(255), legalName: z.string().max(255).optional(), taxId: z.string().max(64).optional(), phone: z.string().max(50).optional(), email: z.string().email().max(320).optional(), notes: z.string().max(500).optional() }), req.body);
    const { createSupplier } = await import("./services/pos");
    res.status(201).json(await createSupplier(input));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/admin/reports/sales-by-product", async (_req, res, next) => {
  try {
    const { listSalesReport } = await import("./services/pos");
    res.json(await listSalesReport());
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
