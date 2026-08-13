import "dotenv/config";
import { eq } from "drizzle-orm";
import { categories, inventoryBalances, posSettings, products } from "../drizzle/schema";
import { db, requireDb } from "../server/db";

const demoCategories = [
  { name: "Cafés", color: "#7A5C48", sortOrder: 1, isFeatured: true },
  { name: "Comida", color: "#D97D50", sortOrder: 2, isFeatured: true },
  { name: "Snacks", color: "#729A73", sortOrder: 3, isFeatured: true },
  { name: "Bebidas", color: "#5F86A4", sortOrder: 4, isFeatured: false },
];

const demoProducts = [
  { category: "Cafés", name: "Café con leche", salePrice: "1.80", stock: "32.000", cost: "0.42", featured: true },
  { category: "Cafés", name: "Cappuccino", salePrice: "2.40", stock: "18.000", cost: "0.58", featured: true },
  { category: "Cafés", name: "Espresso", salePrice: "1.40", stock: "26.000", cost: "0.25", featured: false },
  { category: "Comida", name: "Croissant de mantequilla", salePrice: "2.10", stock: "12.000", cost: "0.72", featured: true },
  { category: "Comida", name: "Sandwich mixto", salePrice: "4.50", stock: "8.000", cost: "1.92", featured: true },
  { category: "Comida", name: "Tostada con tomate", salePrice: "3.20", stock: "15.000", cost: "0.91", featured: false },
  { category: "Snacks", name: "Papas arrugadas", salePrice: "2.50", stock: "20.000", cost: "0.81", featured: true },
  { category: "Snacks", name: "Barrita de chocolate", salePrice: "1.60", stock: "24.000", cost: "0.57", featured: false },
  { category: "Bebidas", name: "Agua mineral", salePrice: "1.50", stock: "40.000", cost: "0.33", featured: true },
  { category: "Bebidas", name: "Zumo de naranja", salePrice: "2.80", stock: "14.000", cost: "1.08", featured: true },
];

async function seed() {
  const database = requireDb();
  await database.insert(posSettings).values({ businessName: "Sweet & Salty", timezone: process.env.BUSINESS_TIMEZONE ?? "Atlantic/Canary", buildVersion: "v0.1.0" }).onDuplicateKeyUpdate({ set: { businessName: "Sweet & Salty" } });
  const categoryIds = new Map<string, number>();
  for (const category of demoCategories) {
    const existing = await database.select().from(categories).where(eq(categories.name, category.name)).limit(1);
    const id = existing[0]?.id ?? Number((await database.insert(categories).values(category))[0].insertId);
    categoryIds.set(category.name, id);
  }
  for (const demo of demoProducts) {
    const categoryId = categoryIds.get(demo.category);
    if (!categoryId) continue;
    const existing = await database.select().from(products).where(eq(products.name, demo.name)).limit(1);
    if (existing[0]) continue;
    const inserted = await database.insert(products).values({ categoryId, name: demo.name, salePrice: demo.salePrice, weightedAverageCost: demo.cost, lastPurchaseCost: demo.cost, vatRate: "7.00", isFeatured: demo.featured });
    await database.insert(inventoryBalances).values({ productId: Number(inserted[0].insertId), quantityOnHand: demo.stock });
  }
  console.log("Sweet & Salty POS: datos demo insertados.");
  await db?.$client.end();
}

seed().catch(async (error) => {
  console.error(error);
  await db?.$client.end();
  process.exitCode = 1;
});
