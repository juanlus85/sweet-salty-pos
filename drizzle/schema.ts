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
  smtpHost: varchar("smtp_host", { length: 255 }),
  smtpPort: int("smtp_port").notNull().default(587),
  smtpSecure: boolean("smtp_secure").notNull().default(false),
  smtpUser: varchar("smtp_user", { length: 320 }),
  smtpPassword: varchar("smtp_password", { length: 255 }),
  smtpFrom: varchar("smtp_from", { length: 320 }),
  loyverseApiBaseUrl: varchar("loyverse_api_base_url", { length: 255 }),
  loyverseApiToken: varchar("loyverse_api_token", { length: 255 }),
  loyverseStoreId: varchar("loyverse_store_id", { length: 64 }),
  buildVersion: varchar("build_version", { length: 64 }).notNull().default("v0.1.0"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const loyverseSyncState = mysqlTable("pos_loyverse_sync_state", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: varchar("merchant_id", { length: 64 }),
  merchantName: varchar("merchant_name", { length: 255 }),
  activeStoreId: varchar("active_store_id", { length: 64 }),
  activeStoreName: varchar("active_store_name", { length: 255 }),
  catalogSyncedAt: datetime("catalog_synced_at", { mode: "date" }),
  salesSyncedAt: datetime("sales_synced_at", { mode: "date" }),
  lastSyncStartedAt: datetime("last_sync_started_at", { mode: "date" }),
  lastSyncFinishedAt: datetime("last_sync_finished_at", { mode: "date" }),
  lastSyncStatus: mysqlEnum("last_sync_status", ["idle", "running", "success", "error"]).notNull().default("idle"),
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const loyverseStores = mysqlTable("pos_loyverse_stores", {
  id: int("id").autoincrement().primaryKey(),
  loyverseId: varchar("loyverse_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  timezone: varchar("timezone", { length: 64 }),
  deletedAt: datetime("deleted_at", { mode: "date" }),
  remoteCreatedAt: datetime("remote_created_at", { mode: "date" }),
  remoteUpdatedAt: datetime("remote_updated_at", { mode: "date" }),
  rawData: json("raw_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_loyverse_stores_loyverse_id_unique").on(table.loyverseId),
]);

export const loyverseCategories = mysqlTable("pos_loyverse_categories", {
  id: int("id").autoincrement().primaryKey(),
  loyverseId: varchar("loyverse_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 32 }),
  deletedAt: datetime("deleted_at", { mode: "date" }),
  remoteCreatedAt: datetime("remote_created_at", { mode: "date" }),
  remoteUpdatedAt: datetime("remote_updated_at", { mode: "date" }),
  rawData: json("raw_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_loyverse_categories_loyverse_id_unique").on(table.loyverseId),
]);

export const loyverseItems = mysqlTable("pos_loyverse_items", {
  id: int("id").autoincrement().primaryKey(),
  loyverseId: varchar("loyverse_id", { length: 64 }).notNull(),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  referenceId: varchar("reference_id", { length: 255 }),
  categoryLoyverseId: varchar("category_loyverse_id", { length: 64 }),
  imageUrl: text("image_url"),
  trackStock: boolean("track_stock").notNull().default(false),
  soldByWeight: boolean("sold_by_weight").notNull().default(false),
  isComposite: boolean("is_composite").notNull().default(false),
  deletedAt: datetime("deleted_at", { mode: "date" }),
  remoteCreatedAt: datetime("remote_created_at", { mode: "date" }),
  remoteUpdatedAt: datetime("remote_updated_at", { mode: "date" }),
  rawData: json("raw_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_loyverse_items_loyverse_id_unique").on(table.loyverseId),
  index("pos_loyverse_items_name_index").on(table.itemName),
]);

export const loyverseVariants = mysqlTable("pos_loyverse_variants", {
  id: int("id").autoincrement().primaryKey(),
  loyverseId: varchar("loyverse_id", { length: 64 }).notNull(),
  itemLoyverseId: varchar("item_loyverse_id", { length: 64 }).notNull(),
  sku: varchar("sku", { length: 255 }),
  barcode: varchar("barcode", { length: 255 }),
  option1Value: varchar("option1_value", { length: 255 }),
  option2Value: varchar("option2_value", { length: 255 }),
  option3Value: varchar("option3_value", { length: 255 }),
  cost: decimal("cost", { precision: 12, scale: 2 }),
  purchaseCost: decimal("purchase_cost", { precision: 12, scale: 2 }),
  defaultPrice: decimal("default_price", { precision: 12, scale: 2 }),
  deletedAt: datetime("deleted_at", { mode: "date" }),
  remoteCreatedAt: datetime("remote_created_at", { mode: "date" }),
  remoteUpdatedAt: datetime("remote_updated_at", { mode: "date" }),
  rawData: json("raw_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_loyverse_variants_loyverse_id_unique").on(table.loyverseId),
  index("pos_loyverse_variants_item_index").on(table.itemLoyverseId),
]);

export const loyverseVariantPrices = mysqlTable("pos_loyverse_variant_prices", {
  id: int("id").autoincrement().primaryKey(),
  variantLoyverseId: varchar("variant_loyverse_id", { length: 64 }).notNull(),
  storeLoyverseId: varchar("store_loyverse_id", { length: 64 }).notNull(),
  pricingType: varchar("pricing_type", { length: 32 }),
  price: decimal("price", { precision: 12, scale: 2 }),
  availableForSale: boolean("available_for_sale").notNull().default(true),
  optimalStock: decimal("optimal_stock", { precision: 12, scale: 3 }),
  lowStock: decimal("low_stock", { precision: 12, scale: 3 }),
  rawData: json("raw_data").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_loyverse_variant_prices_unique").on(table.variantLoyverseId, table.storeLoyverseId),
]);

export const loyverseInventoryLevels = mysqlTable("pos_loyverse_inventory_levels", {
  id: int("id").autoincrement().primaryKey(),
  variantLoyverseId: varchar("variant_loyverse_id", { length: 64 }).notNull(),
  storeLoyverseId: varchar("store_loyverse_id", { length: 64 }).notNull(),
  inStock: decimal("in_stock", { precision: 12, scale: 3 }).notNull().default("0.000"),
  remoteUpdatedAt: datetime("remote_updated_at", { mode: "date" }),
  rawData: json("raw_data").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_loyverse_inventory_levels_unique").on(table.variantLoyverseId, table.storeLoyverseId),
]);

export const loyverseReceipts = mysqlTable("pos_loyverse_receipts", {
  id: int("id").autoincrement().primaryKey(),
  receiptNumber: varchar("receipt_number", { length: 64 }).notNull(),
  storeLoyverseId: varchar("store_loyverse_id", { length: 64 }),
  receiptType: varchar("receipt_type", { length: 32 }),
  refundFor: varchar("refund_for", { length: 64 }),
  receiptDate: datetime("receipt_date", { mode: "date" }),
  cancelledAt: datetime("cancelled_at", { mode: "date" }),
  totalMoney: decimal("total_money", { precision: 12, scale: 2 }).notNull().default("0.00"),
  totalTax: decimal("total_tax", { precision: 12, scale: 2 }).notNull().default("0.00"),
  totalDiscount: decimal("total_discount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  rawData: json("raw_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_loyverse_receipts_number_unique").on(table.receiptNumber),
  index("pos_loyverse_receipts_date_index").on(table.receiptDate),
]);

export const loyverseReceiptLines = mysqlTable("pos_loyverse_receipt_lines", {
  id: int("id").autoincrement().primaryKey(),
  receiptId: int("receipt_id").notNull(),
  lineIndex: int("line_index").notNull(),
  itemLoyverseId: varchar("item_loyverse_id", { length: 64 }),
  variantLoyverseId: varchar("variant_loyverse_id", { length: 64 }),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull().default("0.000"),
  price: decimal("price", { precision: 12, scale: 2 }).notNull().default("0.00"),
  grossTotalMoney: decimal("gross_total_money", { precision: 12, scale: 2 }).notNull().default("0.00"),
  totalMoney: decimal("total_money", { precision: 12, scale: 2 }).notNull().default("0.00"),
  cost: decimal("cost", { precision: 12, scale: 2 }).notNull().default("0.00"),
  costTotal: decimal("cost_total", { precision: 12, scale: 2 }).notNull().default("0.00"),
  rawData: json("raw_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("pos_loyverse_receipt_lines_unique").on(table.receiptId, table.lineIndex),
]);

export const loyverseReceiptPayments = mysqlTable("pos_loyverse_receipt_payments", {
  id: int("id").autoincrement().primaryKey(),
  receiptId: int("receipt_id").notNull(),
  paymentIndex: int("payment_index").notNull(),
  paymentTypeId: varchar("payment_type_id", { length: 64 }),
  moneyAmount: decimal("money_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  rawData: json("raw_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("pos_loyverse_receipt_payments_unique").on(table.receiptId, table.paymentIndex),
]);

export const loyverseShifts = mysqlTable("pos_loyverse_shifts", {
  id: int("id").autoincrement().primaryKey(),
  loyverseId: varchar("loyverse_id", { length: 64 }).notNull(),
  storeLoyverseId: varchar("store_loyverse_id", { length: 64 }),
  openedAt: datetime("opened_at", { mode: "date" }),
  closedAt: datetime("closed_at", { mode: "date" }),
  startingCash: decimal("starting_cash", { precision: 12, scale: 2 }).notNull().default("0.00"),
  cashPayments: decimal("cash_payments", { precision: 12, scale: 2 }).notNull().default("0.00"),
  cashRefunds: decimal("cash_refunds", { precision: 12, scale: 2 }).notNull().default("0.00"),
  paidIn: decimal("paid_in", { precision: 12, scale: 2 }).notNull().default("0.00"),
  paidOut: decimal("paid_out", { precision: 12, scale: 2 }).notNull().default("0.00"),
  rawData: json("raw_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_loyverse_shifts_loyverse_id_unique").on(table.loyverseId),
  index("pos_loyverse_shifts_closed_index").on(table.closedAt),
]);

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

export const fiscalSubmissions = mysqlTable("pos_fiscal_submissions", {
  id: int("id").autoincrement().primaryKey(),
  fiscalRecordId: int("fiscal_record_id").notNull(),
  environment: mysqlEnum("environment", ["sandbox", "production"]).notNull().default("sandbox"),
  status: mysqlEnum("status", ["blocked", "pending", "sending", "accepted", "rejected", "error"]).notNull().default("blocked"),
  attemptCount: int("attempt_count").notNull().default(0),
  requestPayload: json("request_payload"),
  responsePayload: json("response_payload"),
  lastError: text("last_error"),
  lastAttemptAt: timestamp("last_attempt_at"),
  nextRetryAt: timestamp("next_retry_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("pos_fiscal_submissions_record_index").on(table.fiscalRecordId, table.status),
  index("pos_fiscal_submissions_retry_index").on(table.status, table.nextRetryAt),
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
  loyverseId: varchar("loyverse_id", { length: 64 }),
  name: varchar("name", { length: 100 }).notNull(),
  parentCategoryId: int("parent_category_id"),
  color: varchar("color", { length: 7 }).notNull().default("#155E75"),
  imageUrl: text("image_url"),
  iconName: varchar("icon_name", { length: 64 }).notNull().default("Package"),
  sortOrder: int("sort_order").notNull().default(0),
  isFeatured: boolean("is_featured").notNull().default(false),
  isPromotion: boolean("is_promotion").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_categories_name_unique").on(table.name),
  uniqueIndex("pos_categories_loyverse_id_unique").on(table.loyverseId),
  index("pos_categories_sort_index").on(table.sortOrder, table.isActive),
  index("pos_categories_parent_index").on(table.parentCategoryId, table.isActive),
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
  loyverseItemId: varchar("loyverse_item_id", { length: 64 }),
  loyverseVariantId: varchar("loyverse_variant_id", { length: 64 }),
  loyverseStoreId: varchar("loyverse_store_id", { length: 64 }),
  categoryId: int("category_id").notNull(),
  primarySupplierId: int("primary_supplier_id"),
  vatTypeId: int("vat_type_id"),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 100 }),
  barcode: varchar("barcode", { length: 100 }),
  description: text("description"),
  imageUrl: text("image_url"),
  imageZoom: decimal("image_zoom", { precision: 5, scale: 2 }).notNull().default("1.00"),
  imagePositionX: decimal("image_position_x", { precision: 5, scale: 2 }).notNull().default("50.00"),
  imagePositionY: decimal("image_position_y", { precision: 5, scale: 2 }).notNull().default("50.00"),
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
  uniqueIndex("pos_products_loyverse_variant_id_unique").on(table.loyverseVariantId),
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
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }).notNull().default("0.00"),
  pricingMode: varchar("pricing_mode", { length: 24 }).notNull().default("normal"),
  promotionId: int("promotion_id"),
  promotionSlotId: int("promotion_slot_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const promotions = mysqlTable("pos_promotions", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("product_id").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  comboPrice: money("combo_price").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pos_promotions_product_unique").on(table.productId),
]);

export const promotionSlots = mysqlTable("pos_promotion_slots", {
  id: int("id").autoincrement().primaryKey(),
  promotionId: int("promotion_id").notNull(),
  position: int("position").notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  categoryId: int("category_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("pos_promotion_slots_position_unique").on(table.promotionId, table.position),
]);

export const promotionSlotProducts = mysqlTable("pos_promotion_slot_products", {
  id: int("id").autoincrement().primaryKey(),
  slotId: int("slot_id").notNull(),
  productId: int("product_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("pos_promotion_slot_products_unique").on(table.slotId, table.productId),
]);

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
