import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn("[SweetSaltyPOS] DATABASE_URL no está configurada. Las rutas de datos no estarán disponibles.");
}

const pool = databaseUrl
  ? mysql.createPool({
      uri: databaseUrl,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 5),
      enableKeepAlive: true,
    })
  : null;

export const db = pool ? drizzle({ client: pool, schema, mode: "default" }) : null;

export function requireDb() {
  if (!db) {
    throw new Error("La base de datos del TPV no está configurada. Añade DATABASE_URL al entorno.");
  }
  return db;
}

export async function closeDatabaseConnection() {
  if (pool) await pool.end();
}
