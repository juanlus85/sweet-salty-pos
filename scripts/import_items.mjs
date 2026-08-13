import fs from "node:fs";
import { parse } from "csv-parse/sync";
import mysql from "mysql2/promise";

const sourcePath = "/home/ubuntu/upload/export_items.csv";
const input = fs.readFileSync(sourcePath, "utf8");
const rows = parse(input, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
const connection = await mysql.createConnection(process.env.DATABASE_URL);

const money = (value) => {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};
const quantity = (value) => {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : 0;
};
const truthy = (value) => String(value ?? "").trim().toUpperCase() === "Y";
const vatFor = (row, inheritedRate = 0) => {
  if (truthy(row['impuesto - "IVA Gen." (21%)'])) return 21;
  if (truthy(row['impuesto - "IVA" (10%)'])) return 10;
  return inheritedRate;
};
const surchargeFor = (vatRate) => vatRate === 10 ? 1.4 : vatRate === 21 ? 5.2 : 0;
const clean = (value) => String(value ?? "").trim();
const slug = (value) => clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

await connection.beginTransaction();
try {
  const [vatRows] = await connection.query("SELECT id, rate FROM pos_vat_types WHERE is_active = 1");
  const vatIds = new Map(vatRows.map((row) => [Number(row.rate), row.id]));
  const [existingCategories] = await connection.query("SELECT id, name FROM pos_categories");
  const categoryIds = new Map(existingCategories.map((row) => [row.name, row.id]));
  const [maxOrderRows] = await connection.query("SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM pos_categories");
  let nextCategoryOrder = Number(maxOrderRows[0].max_order) + 1;
  const categoriesCreated = [];
  const familyNames = [...new Set(rows.map((row) => clean(row.Categoria)).filter(Boolean))];
  for (const familyName of familyNames) {
    if (!categoryIds.has(familyName)) {
      const [inserted] = await connection.execute("INSERT INTO pos_categories (name, color, icon_name, sort_order, is_featured, is_active) VALUES (?, ?, ?, ?, 0, 1)", [familyName, "#4C8A5A", "Folder", nextCategoryOrder++]);
      categoryIds.set(familyName, inserted.insertId);
      categoriesCreated.push(familyName);
    }
  }

  const productRows = [];
  const handleContext = new Map();
  for (const row of rows) {
    const handle = clean(row.Handle) || `row-${productRows.length + 1}`;
    const optionValues = [1, 2, 3].map((number) => clean(row[`Opción ${number} valor`])).filter(Boolean);
    const parent = handleContext.get(handle);
    const baseName = clean(row.Nombre) || parent?.baseName || handle;
    const familyName = clean(row.Categoria) || parent?.familyName || "Varios";
    const inheritedVat = parent?.vatRate ?? 0;
    const vatRate = vatFor(row, inheritedVat);
    const optionSuffix = optionValues.length ? ` — ${optionValues.join(" / ")}` : "";
    const name = `${baseName}${optionSuffix}`.slice(0, 255);
    const ref = clean(row.REF);
    const barcode = clean(row['Codigo de barras']) || null;
    const baseCost = money(row.Coste);
    const surchargeRate = surchargeFor(vatRate);
    const effectiveCost = Number((baseCost * (1 + surchargeRate / 100)).toFixed(2));
    const stock = quantity(row['En inventario [Sweet & Salty]']);
    const minimumStock = quantity(row['Existencias bajas [Sweet & Salty]']);
    const isVisible = truthy(row['Disponibles para la venta [Sweet & Salty]']);
    const sku = ref || `${slug(handle)}-${productRows.length + 1}`;
    productRows.push({ handle, row, name, familyName, vatRate, surchargeRate, baseCost, effectiveCost, stock, minimumStock, isVisible, sku, barcode });
    if (!parent || clean(row.Nombre)) handleContext.set(handle, { baseName, familyName, vatRate });
  }

  let created = 0;
  let updated = 0;
  for (const item of productRows) {
    const categoryId = categoryIds.get(item.familyName) ?? categoryIds.get("Varios");
    const vatTypeId = vatIds.get(item.vatRate) ?? null;
    const [existing] = await connection.query("SELECT id FROM pos_products WHERE sku = ? LIMIT 1", [item.sku]);
    const values = [categoryId, vatTypeId, item.name, item.sku, item.barcode, item.baseCost, item.surchargeRate, item.baseCost, item.effectiveCost, item.baseCost, item.effectiveCost, item.minimumStock, item.isVisible ? 1 : 0, item.isVisible ? 1 : 0];
    let productId;
    if (existing[0]) {
      productId = existing[0].id;
      await connection.execute("UPDATE pos_products SET category_id=?, vat_type_id=?, name=?, barcode=COALESCE(?, barcode), sale_price=?, vat_rate=?, equivalence_surcharge_rate=?, last_purchase_cost_before_surcharge=?, last_purchase_cost=?, weighted_average_cost_before_surcharge=?, weighted_average_cost=?, minimum_stock=?, show_in_tpv=?, is_active=? WHERE id=?", [categoryId, vatTypeId, item.name, item.barcode, money(item.row['Precio [Sweet & Salty]']), item.vatRate, item.surchargeRate, item.baseCost, item.effectiveCost, item.baseCost, item.effectiveCost, item.minimumStock, item.isVisible ? 1 : 0, 1, productId]);
      updated += 1;
    } else {
      const [inserted] = await connection.execute("INSERT INTO pos_products (category_id, vat_type_id, name, sku, barcode, sale_price, vat_rate, equivalence_surcharge_rate, last_purchase_cost_before_surcharge, last_purchase_cost, weighted_average_cost_before_surcharge, weighted_average_cost, minimum_stock, show_in_tpv, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [categoryId, vatTypeId, item.name, item.sku, item.barcode, money(item.row['Precio [Sweet & Salty]']), item.vatRate, item.surchargeRate, item.baseCost, item.effectiveCost, item.baseCost, item.effectiveCost, item.minimumStock, item.isVisible ? 1 : 0, 1]);
      productId = inserted.insertId;
      created += 1;
    }
    const [balance] = await connection.query("SELECT quantity_on_hand FROM pos_inventory_balances WHERE product_id=?", [productId]);
    const before = balance[0] ? Number(balance[0].quantity_on_hand) : 0;
    if (balance[0]) await connection.execute("UPDATE pos_inventory_balances SET quantity_on_hand=? WHERE product_id=?", [item.stock, productId]);
    else await connection.execute("INSERT INTO pos_inventory_balances (product_id, quantity_on_hand) VALUES (?, ?)", [productId, item.stock]);
    if (!balance[0]) await connection.execute("INSERT INTO pos_stock_movements (product_id, movement_type, quantity_delta, quantity_before, quantity_after, unit_cost, source_type, source_id, note) VALUES (?, 'opening', ?, ?, ?, ?, 'csv_import', NULL, ?)", [productId, item.stock, before, item.stock, item.effectiveCost, `Importación CSV · coste base ${item.baseCost.toFixed(2)} € + recargo ${item.surchargeRate.toFixed(2)} %`]);
  }
  await connection.commit();
  console.log(JSON.stringify({ rows: rows.length, categoriesCreated, productsCreated: created, productsUpdated: updated, vatIds: Object.fromEntries(vatIds) }, null, 2));
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
