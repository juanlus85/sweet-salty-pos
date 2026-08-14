import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  fiscalInvoices,
  fiscalProfiles,
  fiscalRecords,
  fiscalSeries,
  fiscalSubmissions,
  auditLog,
} from "../../drizzle/schema";
import { requireDb } from "../db";

type FiscalLine = {
  productName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  lineSubtotal: number;
  lineVat: number;
  lineTotal: number;
};

type FiscalIssueInput = {
  saleId: number;
  issuedAt: Date;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  paymentMethod: "cash" | "card";
  lines: FiscalLine[];
};

const toMoney = (value: number) => value.toFixed(2);
const canonicalStringify = (value: unknown) => JSON.stringify(value);
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

async function getOrCreateProfile(tx: any) {
  const existing = await tx
    .select()
    .from(fiscalProfiles)
    .where(eq(fiscalProfiles.isActive, true))
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await tx.insert(fiscalProfiles).values({
    commercialName: "Sweet & Salty",
    legalName: "Ana Perez Peramo",
    taxId: "77807125B",
    addressLine1: "Calle Adriano 6",
    postalCode: "41001",
    city: "Sevilla",
    countryCode: "ES",
    softwareName: "Sweet & Salty POS",
    softwareVersion: "preparacion-verifactu",
    mode: "test",
    submissionEnvironment: "sandbox",
    certificateStatus: "not_configured",
  });
  const profileId = Number(inserted[0].insertId);
  const profile = await tx.select().from(fiscalProfiles).where(eq(fiscalProfiles.id, profileId)).limit(1);
  if (!profile[0]) throw new Error("No se pudo crear el perfil fiscal de pruebas.");
  return profile[0];
}

async function getOrCreateSeries(tx: any, profileId: number) {
  const existing = await tx
    .select()
    .from(fiscalSeries)
    .where(and(eq(fiscalSeries.profileId, profileId), eq(fiscalSeries.code, "SS")))
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await tx.insert(fiscalSeries).values({
    profileId,
    code: "SS",
    description: "Tickets Sweet & Salty — modo de pruebas",
    nextNumber: 1,
    isActive: true,
  });
  const seriesId = Number(inserted[0].insertId);
  const series = await tx.select().from(fiscalSeries).where(eq(fiscalSeries.id, seriesId)).limit(1);
  if (!series[0]) throw new Error("No se pudo crear la serie fiscal de pruebas.");
  return series[0];
}

export async function issueFiscalTestRecord(tx: any, input: FiscalIssueInput) {
  const profile = await getOrCreateProfile(tx);
  const series = await getOrCreateSeries(tx, profile.id);
  const existingInvoice = await tx.select().from(fiscalInvoices).where(eq(fiscalInvoices.saleId, input.saleId)).limit(1);
  if (existingInvoice[0]) return { fiscalInvoice: existingInvoice[0], alreadyIssued: true };

  const latestRecord = await tx
    .select()
    .from(fiscalRecords)
    .orderBy(desc(fiscalRecords.chainPosition))
    .limit(1);
  const chainPosition = (latestRecord[0]?.chainPosition ?? 0) + 1;
  const sequenceNumber = series.nextNumber;
  const date = input.issuedAt.toISOString().slice(0, 10);
  const invoiceNumber = `${series.code}-${date.replaceAll("-", "")}-${String(sequenceNumber).padStart(6, "0")}`;

  const snapshot = {
    schema: "sweet-salty-verifactu-preparation/1.0",
    environment: "sandbox",
    issuer: {
      commercialName: profile.commercialName,
      legalName: profile.legalName,
      taxId: profile.taxId,
      addressLine1: profile.addressLine1,
      postalCode: profile.postalCode,
      city: profile.city,
      countryCode: profile.countryCode,
    },
    document: {
      type: "simplified",
      series: series.code,
      sequenceNumber,
      invoiceNumber,
      issuedAt: input.issuedAt.toISOString(),
      paymentMethod: input.paymentMethod,
      subtotal: toMoney(input.subtotal),
      vatAmount: toMoney(input.vatAmount),
      totalAmount: toMoney(input.totalAmount),
      lines: input.lines.map((line) => ({
        productName: line.productName,
        sku: line.sku,
        quantity: line.quantity.toFixed(3),
        unitPrice: toMoney(line.unitPrice),
        vatRate: line.vatRate.toFixed(2),
        lineSubtotal: toMoney(line.lineSubtotal),
        lineVat: toMoney(line.lineVat),
        lineTotal: toMoney(line.lineTotal),
      })),
    },
  };

  const invoiceInserted = await tx.insert(fiscalInvoices).values({
    saleId: input.saleId,
    profileId: profile.id,
    seriesId: series.id,
    sequenceNumber,
    invoiceNumber,
    invoiceType: "simplified",
    status: "issued",
    issuedAt: input.issuedAt,
    subtotal: toMoney(input.subtotal),
    vatAmount: toMoney(input.vatAmount),
    totalAmount: toMoney(input.totalAmount),
    immutableSnapshot: snapshot,
  });
  const fiscalInvoiceId = Number(invoiceInserted[0].insertId);

  const canonicalPayload = {
    version: "1.0",
    recordType: "high",
    issuerTaxId: profile.taxId,
    invoiceNumber,
    issuedAt: input.issuedAt.toISOString(),
    totalAmount: toMoney(input.totalAmount),
    previousHash: latestRecord[0]?.recordHash ?? null,
    chainPosition,
    snapshot,
  };
  const canonicalJson = canonicalStringify(canonicalPayload);
  const recordHash = sha256(canonicalJson);
  const qrPayload = `SS-VERIFACTU-TEST|${profile.taxId}|${invoiceNumber}|${date}|${toMoney(input.totalAmount)}|${recordHash}`;

  const fiscalRecordInserted = await tx.insert(fiscalRecords).values({
    fiscalInvoiceId,
    recordType: "high",
    chainPosition,
    algorithm: "SHA-256",
    previousHash: latestRecord[0]?.recordHash ?? null,
    recordHash,
    canonicalPayload,
    qrPayload,
    submissionStatus: "sandbox_pending",
    submissionMessage: "Registro generado en modo de preparación. Sin remisión a AEAT.",
  });
  const fiscalRecordId = Number(fiscalRecordInserted[0].insertId);
  await tx.insert(fiscalSubmissions).values({
    fiscalRecordId,
    environment: "sandbox",
    status: "blocked",
    requestPayload: { recordHash, invoiceNumber, blockedReason: "AEAT_SUBMISSION_ENABLED=false" },
    lastError: "Remisión AEAT desactivada deliberadamente en modo de preparación.",
  });

  await tx.insert(auditLog).values({
    entityType: "fiscal_invoice",
    entityId: fiscalInvoiceId,
    action: "issue_test_record",
    afterData: { invoiceNumber, recordHash, chainPosition, mode: "test" },
    note: "Registro fiscal de preparación creado. No remitido a AEAT.",
  });

  await tx
    .update(fiscalSeries)
    .set({ nextNumber: sequenceNumber + 1 })
    .where(eq(fiscalSeries.id, series.id));

  return { fiscalInvoice: { id: fiscalInvoiceId, invoiceNumber, recordHash, chainPosition }, alreadyIssued: false };
}

export async function getFiscalReadinessDashboard() {
  const database = requireDb();
  const profile = await database.select().from(fiscalProfiles).where(eq(fiscalProfiles.isActive, true)).limit(1);
  const records = await database
    .select({
      id: fiscalRecords.id,
      fiscalInvoiceId: fiscalRecords.fiscalInvoiceId,
      invoiceNumber: fiscalInvoices.invoiceNumber,
      recordType: fiscalRecords.recordType,
      chainPosition: fiscalRecords.chainPosition,
      algorithm: fiscalRecords.algorithm,
      previousHash: fiscalRecords.previousHash,
      recordHash: fiscalRecords.recordHash,
      submissionStatus: fiscalRecords.submissionStatus,
      submissionMessage: fiscalRecords.submissionMessage,
      generatedAt: fiscalRecords.generatedAt,
      totalAmount: fiscalInvoices.totalAmount,
    })
    .from(fiscalRecords)
    .innerJoin(fiscalInvoices, eq(fiscalInvoices.id, fiscalRecords.fiscalInvoiceId))
    .orderBy(desc(fiscalRecords.chainPosition))
    .limit(30);
  const totals = await database
    .select({ count: sql<number>`count(*)` })
    .from(fiscalRecords);
  const queue = await database
    .select({ status: fiscalSubmissions.status, count: sql<number>`count(*)` })
    .from(fiscalSubmissions)
    .groupBy(fiscalSubmissions.status);
  const blockedSubmissions = Number(queue.find((item) => item.status === "blocked")?.count ?? 0);

  return {
    mode: "test" as const,
    profile: profile[0] ?? null,
    records,
    totalRecords: Number(totals[0]?.count ?? 0),
    submissionQueue: { blocked: blockedSubmissions, total: queue.reduce((sum, item) => sum + Number(item.count ?? 0), 0), enabled: false },
    readiness: {
      immutableRecords: true,
      sha256Chain: true,
      qrPreparation: true,
      aeatSubmission: false,
      certificateConfigured: profile[0]?.certificateStatus === "verified",
    },
    notice: "Modo de preparación. No se ha realizado ninguna remisión a AEAT.",
  };
}

export async function verifyFiscalChain() {
  const database = requireDb();
  const records = await database.select().from(fiscalRecords).orderBy(asc(fiscalRecords.chainPosition));
  let previousHash: string | null = null;
  const problems: Array<{ id: number; chainPosition: number; message: string }> = [];
  for (const record of records) {
    const payload = typeof record.canonicalPayload === "string" ? JSON.parse(record.canonicalPayload) as Record<string, unknown> : record.canonicalPayload as Record<string, unknown>;
    const expectedHash = sha256(canonicalStringify(payload));
    if (record.previousHash !== previousHash) problems.push({ id: record.id, chainPosition: record.chainPosition, message: "La referencia al registro anterior no coincide." });
    if (record.recordHash !== expectedHash) problems.push({ id: record.id, chainPosition: record.chainPosition, message: "La huella SHA-256 no coincide con el contenido almacenado." });
    previousHash = record.recordHash;
  }
  return { valid: problems.length === 0, checkedRecords: records.length, problems };
}


async function appendCorrectionRecord(input: { fiscalInvoiceId: number; recordType: "cancellation" | "rectification"; reason: string; correctedTotal?: number }) {
  const database = requireDb();
  const original = await database.select().from(fiscalInvoices).where(eq(fiscalInvoices.id, input.fiscalInvoiceId)).limit(1);
  if (!original[0]) throw new Error("No se encontró el documento fiscal de pruebas.");
  const existing = await database.select().from(fiscalRecords).where(and(eq(fiscalRecords.fiscalInvoiceId, input.fiscalInvoiceId), eq(fiscalRecords.recordType, input.recordType))).limit(1);
  if (existing[0]) throw new Error(`Ya existe un registro de ${input.recordType === "cancellation" ? "anulación" : "rectificación"} para este documento.`);
  const latestRecord = await database.select().from(fiscalRecords).orderBy(desc(fiscalRecords.chainPosition)).limit(1);
  const chainPosition = (latestRecord[0]?.chainPosition ?? 0) + 1;
  const issuedAt = new Date();
  const snapshot = typeof original[0].immutableSnapshot === "string" ? JSON.parse(original[0].immutableSnapshot) as Record<string, unknown> : original[0].immutableSnapshot as Record<string, unknown>;
  const canonicalPayload = {
    schema: "sweet-salty-verifactu-preparation/1.0",
    environment: "sandbox",
    recordType: input.recordType,
    originalInvoiceNumber: original[0].invoiceNumber,
    originalFiscalInvoiceId: original[0].id,
    originalRecordStatus: original[0].status,
    reason: input.reason.trim(),
    correctedTotal: input.correctedTotal === undefined ? null : toMoney(input.correctedTotal),
    issuedAt: issuedAt.toISOString(),
    previousHash: latestRecord[0]?.recordHash ?? null,
    chainPosition,
    originalSnapshot: snapshot,
  };
  const recordHash = sha256(canonicalStringify(canonicalPayload));
  const qrPayload = `SS-VERIFACTU-TEST|${input.recordType === "cancellation" ? "ANULACION" : "RECTIFICACION"}|${original[0].invoiceNumber}|${issuedAt.toISOString().slice(0, 10)}|${recordHash}`;
  const correctionRecordInserted = await database.insert(fiscalRecords).values({
    fiscalInvoiceId: input.fiscalInvoiceId,
    recordType: input.recordType,
    chainPosition,
    algorithm: "SHA-256",
    previousHash: latestRecord[0]?.recordHash ?? null,
    recordHash,
    canonicalPayload,
    qrPayload,
    submissionStatus: "sandbox_pending",
    submissionMessage: "Registro de preparación. No se ha remitido a AEAT.",
    generatedAt: issuedAt,
  });
  await database.insert(fiscalSubmissions).values({
    fiscalRecordId: Number(correctionRecordInserted[0].insertId),
    environment: "sandbox",
    status: "blocked",
    requestPayload: { recordHash, originalInvoiceNumber: original[0].invoiceNumber, recordType: input.recordType, blockedReason: "AEAT_SUBMISSION_ENABLED=false" },
    lastError: "Remisión AEAT desactivada deliberadamente en modo de preparación.",
  });
  await database.insert(auditLog).values({
    entityType: "fiscal_invoice",
    entityId: input.fiscalInvoiceId,
    action: input.recordType === "cancellation" ? "cancel_test_record" : "rectify_test_record",
    beforeData: { invoiceNumber: original[0].invoiceNumber, status: original[0].status },
    afterData: { recordType: input.recordType, recordHash, chainPosition, reason: input.reason.trim(), mode: "test" },
    note: "Corrección fiscal de preparación creada. No remitida a AEAT.",
  });
  await database.update(fiscalInvoices).set({ status: input.recordType === "cancellation" ? "cancelled" : "rectified" }).where(eq(fiscalInvoices.id, input.fiscalInvoiceId));
  return { success: true, fiscalInvoiceId: input.fiscalInvoiceId, recordType: input.recordType, recordHash, chainPosition };
}

export async function cancelFiscalTestInvoice(input: { fiscalInvoiceId: number; reason: string }) {
  if (!input.reason.trim()) throw new Error("La anulación necesita un motivo.");
  return appendCorrectionRecord({ ...input, recordType: "cancellation" });
}

export async function rectifyFiscalTestInvoice(input: { fiscalInvoiceId: number; reason: string; correctedTotal?: number }) {
  if (!input.reason.trim()) throw new Error("La rectificación necesita un motivo.");
  return appendCorrectionRecord({ ...input, recordType: "rectification" });
}
