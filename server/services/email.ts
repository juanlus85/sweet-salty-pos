import nodemailer from "nodemailer";
import QRCode from "qrcode";
import { getSaleDetails, getSmtpConfig } from "./pos";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] ?? character));
}

type ReadySmtpConfig = Omit<Awaited<ReturnType<typeof getSmtpConfig>>, "host" | "user" | "password"> & { host: string; user: string; password: string };

async function requireSmtpConfig(): Promise<ReadySmtpConfig> {
  const config = await getSmtpConfig();
  if (!config.host) throw new Error("Correo no configurado: falta el servidor SMTP.");
  if (!config.user) throw new Error("Correo no configurado: falta el usuario SMTP.");
  if (!config.password) throw new Error("Correo no configurado: falta la contraseña SMTP.");
  return { ...config, host: config.host, user: config.user, password: config.password };
}

export async function getReceiptEmailStatus() {
  const config = await getSmtpConfig();
  const configured = Boolean(config.host && config.user && config.password);
  return {
    configured,
    source: config.source,
    message: configured ? `Correo de recibos configurado (${config.source === "database" ? "Administración" : "variables de entorno"}).` : "Configura el servidor SMTP, usuario y contraseña desde Administración → Configuración.",
  };
}

export async function verifySmtpConnection() {
  const config = await requireSmtpConfig();
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });
  await transport.verify();
  transport.close();
  return { success: true, message: "La conexión SMTP se ha verificado correctamente." };
}

export async function sendSaleReceiptEmail(input: { saleId: number; recipient: string }) {
  const recipient = input.recipient.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error("Introduce una dirección de correo válida.");
  const sale = await getSaleDetails(input.saleId);
  const config = await requireSmtpConfig();
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });
  const qrPayload = sale.fiscal?.record?.qrPayload;
  const qrDataUrl = qrPayload ? await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "M", margin: 1, width: 220 }) : null;
  const lineRows = sale.lines.map((line) => `<tr><td>${escapeHtml(line.productName)}<br><small>${escapeHtml(line.quantity)} ud. × ${Number(line.unitPrice).toFixed(2)} €</small></td><td style="text-align:right">${Number(line.lineTotal).toFixed(2)} €</td></tr>`).join("");
  const qr = qrDataUrl ? `<hr><p style="text-align:center"><img src="${qrDataUrl}" width="180" height="180" alt="QR de preparación"><br><small>QR DE PREPARACIÓN · NO VÁLIDO AEAT</small></p>` : "";
  const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#1f3325;max-width:620px;margin:0 auto;padding:24px"><h1 style="margin-bottom:4px">Sweet &amp; Salty</h1><p style="margin-top:0;color:#637468">Calle Adriano 6 · 41001 Sevilla<br>Ana Perez Peramo · NIF 77807125B</p><hr><h2>Ticket ${escapeHtml(sale.saleNumber)}</h2><p>${new Date(sale.createdAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</p><table style="width:100%;border-collapse:collapse">${lineRows}</table><hr><p style="text-align:right;font-size:20px"><strong>Total: ${Number(sale.totalAmount).toFixed(2)} €</strong></p><p style="color:#637468">IVA incluido: ${Number(sale.vatAmount).toFixed(2)} €</p>${qr}</body></html>`;
  const text = `Sweet & Salty\nTicket ${sale.saleNumber}\nTotal: ${Number(sale.totalAmount).toFixed(2)} €\n\nGracias por tu visita.`;
  await transport.sendMail({ from: config.from || config.user, to: recipient, subject: `Ticket Sweet & Salty · ${sale.saleNumber}`, text, html });
  transport.close();
  return { success: true, saleNumber: sale.saleNumber, recipient };
}
