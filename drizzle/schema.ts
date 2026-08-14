import {
  boolean,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Esquema exclusivo de Sweet & Salty POS.
 * No hay claves foráneas hacia la base de datos de Hostel Management.
 */

const money = (name: string) => decimal(name, { precision: 12, scale: 2 });
const quantity = (name: string) => decimal(name, { precision: 12, scale: 3 });

export const posSettings = mysqlTable("pos_settings", {
  id: int("id").autoincrement().primaryKey(),
  businessName: varchar("business_name", { length: 160 }).notNull().default("Sweet & Salty"),
  currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Europe/Madrid"),
  businessDayStartsAt: varchar("business_day_starts_at", { length: 5 }).notNull().default("07:00"),
  defaultVatRate: decimal("default_vat_rate", { precision: 5, scale: 2 }).notNull().default("10.00"),
  buildVersion: varchar("build_version", { length: 64 }).notNull().default("v0.1.0"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const fiscalProfiles = mysqlTable("pos_fiscal_profiles", {
  id: int("id").autoincrement().primaryKey(),
  commercialName: varchar("commercial_name", { length: 160 }).notNull().default("Sweet & Salty"),
  legalName: varchar("legal_name", { length: 255 }).notNull().default("Ana Perez Peramo"),
  taxId: varchar("tax_id", { length: 32 }).notNull().default("77807125B"),
  addressLine1: varchar("address_line1", { length: 255 }).notNull().default("Calle Adriano 6"),
  postalCode: varchar("postal_code", { length: 16 }).notNull().default("41001"),
  city: varchar("city", { length: 100 }).notNull().default("Sevilla"),
  countryCode: varchar("country_code", { length: 2 }).notNull().default("ES"),
  softwareName: varchar("software_name", { length: 160 }).notNull().default("Sweet & Salty POS"),
  softwareVersion: varchar("software_version", { length: 64 }).notNull().default("preparacion-verifactu"),
  mode: mysqlEnum("mode", ["test", "verifactu", "non_verifiable"]).notNull().default("test"),
  submissionEnvironment: mysqlEnum("submission_environment", ["sandbox", "production"]).notNull().default("sandbox"),
  certificateStatus: mysqlEnum("certificate_status", ["not_configured", "configured", "verified"]).notNull().default("not_configured"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_fiscal_profiles_tax_id_unique").on(table.taxId),
]);

export const fiscalSeries = mysqlTable("pos_fiscal_series", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profile_id").notNull(),
  code: varchar("code", { length: 20 }).notNull().default("SS"),
  description: varchar("description", { length: 160 }).notNull().default("Tickets Sweet & Salty"),
  nextNumber: int("next_number").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_fiscal_series_profile_code_unique").on(table.profileId, table.code),
]);

export const fiscalInvoices = mysqlTable("pos_fiscal_invoices", {
  id: int("id").autoincrement().primaryKey(),
  saleId: int("sale_id").notNull(),
  profileId: int("profile_id").notNull(),
  seriesId: int("series_id").notNull(),
  sequenceNumber: int("sequence_number").notNull(),
  invoiceNumber: varchar("invoice_number", { length: 64 }).notNull(),
  invoiceType: mysqlEnum("invoice_type", ["simplified", "complete", "rectifying", "cancellation"]).notNull().default("simplified"),
  status: mysqlEnum("status", ["issued", "cancelled", "rectified"]).notNull().default("issued"),
  originalFiscalInvoiceId: int("original_fiscal_invoice_id"),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  subtotal: money("subtotal").notNull(),
  vatAmount: money("vat_amount").notNull(),
  totalAmount: money("total_amount").notNull(),
  immutableSnapshot: json("immutable_snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("pos_fiscal_invoices_sale_unique").on(table.saleId),
  uniqueIndex("pos_fiscal_invoices_number_unique").on(table.invoiceNumber),
  index("pos_fiscal_invoices_profile_index").on(table.profileId, table.issuedAt),
]);

export const fiscalRecords = mysqlTable("pos_fiscal_records", {
  id: int("id").autoincrement().primaryKey(),
  fiscalInvoiceId: int("fiscal_invoice_id").notNull(),
  recordType: mysqlEnum("record_type", ["high", "cancellation", "rectification"]).notNull().default("high"),
  chainPosition: int("chain_position").notNull(),
  algorithm: varchar("algorithm", { length: 32 }).notNull().default("SHA-256"),
  previousHash: varchar("previous_hash", { length: 64 }),
  recordHash: varchar("record_hash", { length: 64 }).notNull(),
  canonicalPayload: json("canonical_payload").notNull(),
  qrPayload: text("qr_payload"),
  submissionStatus: mysqlEnum("submission_status", ["not_ready", "sandbox_pending", "sandbox_sent", "accepted", "rejected", "error"]).notNull().default("not_ready"),
  submissionMessage: text("submission_message"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  submittedAt: timestamp("submitted_at"),
}, (table) => [
  uniqueIndex("pos_fiscal_records_invoice_unique").on(table.fiscalInvoiceId, table.recordType),
  uniqueIndex("pos_fiscal_records_chain_position_unique").on(table.chainPosition),
  index("pos_fiscal_records_submission_index").on(table.submissionStatus, table.generatedAt),
]);

export const vatTypes = mysqlTable("pos_vat_types", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  rate: decimal("rate", { precision: 5, scale: 2 }).notNull(),
  sortOrder: int("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_vat_types_name_unique").on(table.name),
  uniqueIndex("pos_vat_types_rate_unique").on(table.rate),
]);

export const categories = mysqlTable("pos_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).notNull().default("#155E75"),
  imageUrl: text("image_url"),
  iconName: varchar("icon_name", { length: 64 }).notNull().default("Package"),
  sortOrder: int("sort_order").notNull().default(0),
  isFeatured: boolean("is_featured").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_categories_name_unique").on(table.name),
  index("pos_categories_sort_index").on(table.sortOrder, table.isActive),
]);

export const suppliers = mysqlTable("pos_suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  legalName: varchar("legal_name", { length: 255 }),
  taxId: varchar("tax_id", { length: 64 }),
  contactName: varchar("contact_name", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_suppliers_name_unique").on(table.name),
]);

export const products = mysqlTable("pos_products", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("category_id").notNull(),
  primarySupplierId: int("primary_supplier_id"),
  vatTypeId: int("vat_type_id"),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 100 }),
  barcode: varchar("barcode", { length: 100 }),
  description: text("description"),
  imageUrl: text("image_url"),
  unit: varchar("unit", { length: 32 }).notNull().default("unidad"),
  salePrice: money("sale_price").notNull().default("0.00"),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).notNull().default("10.00"),
  equivalenceSurchargeRate: decimal("equivalence_surcharge_rate", { precision: 5, scale: 2 }).notNull().default("0.00"),
  lastPurchaseCostBeforeSurcharge: money("last_purchase_cost_before_surcharge").notNull().default("0.00"),
  lastPurchaseCost: money("last_purchase_cost").notNull().default("0.00"),
  weightedAverageCostBeforeSurcharge: money("weighted_average_cost_before_surcharge").notNull().default("0.00"),
  weightedAverageCost: money("weighted_average_cost").notNull().default("0.00"),
  minimumStock: quantity("minimum_stock").notNull().default("0.000"),
  isFeatured: boolean("is_featured").notNull().default(false),
  showInTpv: boolean("show_in_tpv").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_products_sku_unique").on(table.sku),
  uniqueIndex("pos_products_barcode_unique").on(table.barcode),
  index("pos_products_category_index").on(table.categoryId, table.isActive),
  index("pos_products_name_index").on(table.name),
]);

export const supplierProducts = mysqlTable("pos_supplier_products", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplier_id").notNull(),
  productId: int("product_id").notNull(),
  supplierReference: varchar("supplier_reference", { length: 100 }),
  lastUnitCost: money("last_unit_cost"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_supplier_product_unique").on(table.supplierId, table.productId),
]);

export const inventoryBalances = mysqlTable("pos_inventory_balances", {
  productId: int("product_id").primaryKey(),
  quantityOnHand: quantity("quantity_on_hand").notNull().default("0.000"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const purchaseInvoices = mysqlTable("pos_purchase_invoices", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplier_id"),
  detectedSupplierName: varchar("detected_supplier_name", { length: 255 }),
  invoiceNumber: varchar("invoice_number", { length: 100 }),
  invoiceDate: datetime("invoice_date", { mode: "date" }),
  subtotal: money("subtotal").notNull().default("0.00"),
  vatAmount: money("vat_amount").notNull().default("0.00"),
  totalAmount: money("total_amount").notNull().default("0.00"),
  equivalenceSurchargeAmount: money("equivalence_surcharge_amount").notNull().default("0.00"),
  documentUrl: text("document_url"),
  documentName: varchar("document_name", { length: 255 }),
  ocrStatus: mysqlEnum("ocr_status", ["not_requested", "processing", "ready", "failed", "reviewed"]).notNull().default("not_requested"),
  ocrData: json("ocr_data"),
  status: mysqlEnum("status", ["draft", "received", "void"]).notNull().default("draft"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("pos_purchase_invoices_date_index").on(table.invoiceDate),
  index("pos_purchase_invoices_supplier_index").on(table.supplierId, table.status),
]);

export const purchaseInvoiceLines = mysqlTable("pos_purchase_invoice_lines", {
  id: int("id").autoincrement().primaryKey(),
  purchaseInvoiceId: int("purchase_invoice_id").notNull(),
  productId: int("product_id"),
  supplierReference: varchar("supplier_reference", { length: 100 }),
  detectedName: varchar("detected_name", { length: 255 }),
  quantity: quantity("quantity").notNull(),
  unitCost: money("unit_cost").notNull(),
  equivalenceSurchargeRate: decimal("equivalence_surcharge_rate", { precision: 5, scale: 2 }).notNull().default("0.00"),
  equivalenceSurchargeAmount: money("equivalence_surcharge_amount").notNull().default("0.00"),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).notNull().default("10.00"),
  lineTotal: money("line_total").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cashSessions = mysqlTable("pos_cash_sessions", {
  id: int("id").autoincrement().primaryKey(),
  businessDate: varchar("business_date", { length: 10 }).notNull(),
  openingFloat: money("opening_float").notNull().default("0.00"),
  expectedCash: money("expected_cash").notNull().default("0.00"),
  countedCash: money("counted_cash"),
  cardTotal: money("card_total").notNull().default("0.00"),
  countedCard: money("counted_card"),
  denominationCounts: json("denomination_counts"),
  difference: money("difference"),
  status: mysqlEnum("status", ["open", "closed"]).notNull().default("open"),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  notes: text("notes"),
}, (table) => [
  uniqueIndex("pos_cash_sessions_date_unique").on(table.businessDate),
]);

export const sales = mysqlTable("pos_sales", {
  id: int("id").autoincrement().primaryKey(),
  saleNumber: varchar("sale_number", { length: 32 }).notNull(),
  cashSessionId: int("cash_session_id").notNull(),
  subtotal: money("subtotal").notNull(),
  discountAmount: money("discount_amount").notNull().default("0.00"),
  vatAmount: money("vat_amount").notNull().default("0.00"),
  totalAmount: money("total_amount").notNull(),
  status: mysqlEnum("status", ["completed", "void", "refunded"]).notNull().default("completed"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  voidedAt: timestamp("voided_at"),
  voidReason: varchar("void_reason", { length: 255 }),
}, (table) => [
  uniqueIndex("pos_sales_number_unique").on(table.saleNumber),
  index("pos_sales_session_index").on(table.cashSessionId, table.createdAt),
]);

export const saleLines = mysqlTable("pos_sale_lines", {
  id: int("id").autoincrement().primaryKey(),
  saleId: int("sale_id").notNull(),
  productId: int("product_id"),
  productName: varchar("product_name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 100 }),
  quantity: quantity("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  unitCost: money("unit_cost").notNull().default("0.00"),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).notNull().default("10.00"),
  lineSubtotal: money("line_subtotal").notNull(),
  lineVat: money("line_vat").notNull().default("0.00"),
  lineTotal: money("line_total").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const payments = mysqlTable("pos_payments", {
  id: int("id").autoincrement().primaryKey(),
  saleId: int("sale_id").notNull(),
  method: mysqlEnum("method", ["cash", "card"]).notNull(),
  amount: money("amount").notNull(),
  receivedAmount: money("received_amount"),
  changeAmount: money("change_amount").notNull().default("0.00"),
  terminalReference: varchar("terminal_reference", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("pos_payments_sale_index").on(table.saleId),
  index("pos_payments_method_index").on(table.method, table.createdAt),
]);

export const stockMovements = mysqlTable("pos_stock_movements", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("product_id").notNull(),
  movementType: mysqlEnum("movement_type", ["opening", "purchase_receipt", "sale", "sale_return", "adjustment", "waste", "void_reversal"]).notNull(),
  quantityDelta: quantity("quantity_delta").notNull(),
  quantityBefore: quantity("quantity_before").notNull(),
  quantityAfter: quantity("quantity_after").notNull(),
  unitCost: money("unit_cost"),
  sourceType: varchar("source_type", { length: 50 }),
  sourceId: int("source_id"),
  note: varchar("note", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("pos_stock_movements_product_index").on(table.productId, table.createdAt),
]);

export const cashMovements = mysqlTable("pos_cash_movements", {
  id: int("id").autoincrement().primaryKey(),
  cashSessionId: int("cash_session_id").notNull(),
  movementType: mysqlEnum("movement_type", ["float", "cash_sale", "withdrawal", "cash_in", "cash_out", "refund"]).notNull(),
  amount: money("amount").notNull(),
  note: varchar("note", { length: 255 }),
  sourceType: varchar("source_type", { length: 50 }),
  sourceId: int("source_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("pos_cash_movements_session_index").on(table.cashSessionId, table.createdAt),
]);

export const auditLog = mysqlTable("pos_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  entityType: varchar("entity_type", { length: 64 }).notNull(),
  entityId: int("entity_id").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  beforeData: json("before_data"),
  afterData: json("after_data"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("pos_audit_entity_index").on(table.entityType, table.entityId, table.createdAt),
]);

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type CashSession = typeof cashSessions.$inferSelect;
export type Sale = typeof sales.$inferSelect;
