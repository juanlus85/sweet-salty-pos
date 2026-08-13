import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function saveProductImage(input: { fileData: string; fileName: string; contentType: string }) {
  if (!allowedTypes.has(input.contentType)) throw new Error("La imagen debe ser JPG, PNG o WebP.");
  const data = input.fileData.split(",")[1] || input.fileData;
  const buffer = Buffer.from(data, "base64");
  if (buffer.length === 0) throw new Error("La imagen está vacía.");
  if (buffer.length > 5 * 1024 * 1024) throw new Error("La imagen supera el límite de 5 MB.");
  const extension = input.contentType === "image/jpeg" ? "jpg" : input.contentType.split("/")[1];
  const cleanName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^.]+$/, "") || "product";
  const fileName = `${Date.now()}-${cleanName.slice(0, 120)}.${extension}`;
  const directory = path.resolve(process.env.UPLOADS_DIR ?? "uploads", "products");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, fileName), buffer);
  return { url: `/uploads/products/${fileName}`, fileName };
}


export async function saveInvoiceDocument(input: { fileData: string; fileName: string; contentType: string }) {
  const allowedDocumentTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
  if (!allowedDocumentTypes.has(input.contentType)) throw new Error("La factura debe ser PDF, JPG, PNG o WEBP.");
  const data = input.fileData.split(",")[1] || input.fileData;
  const buffer = Buffer.from(data, "base64");
  if (buffer.length === 0) throw new Error("El documento está vacío.");
  if (buffer.length > 15 * 1024 * 1024) throw new Error("La factura supera el límite de 15 MB.");
  const extension = input.contentType === "application/pdf" ? "pdf" : input.contentType === "image/jpeg" ? "jpg" : input.contentType.split("/")[1];
  const cleanName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^.]+$/, "") || "invoice";
  const fileName = `${Date.now()}-${cleanName.slice(0, 120)}.${extension}`;
  const directory = path.resolve(process.env.UPLOADS_DIR ?? "uploads", "invoices");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, fileName), buffer);
  return { url: `/uploads/invoices/${fileName}`, fileName };
}
