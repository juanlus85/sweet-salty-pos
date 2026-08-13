import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

const invoiceSchema = {
  type: "object",
  properties: {
    supplierName: { type: ["string", "null"] },
    invoiceNumber: { type: ["string", "null"] },
    invoiceDate: { type: ["string", "null"] },
    subtotal: { type: ["number", "null"] },
    vatRate: { type: ["number", "null"] },
    vatAmount: { type: ["number", "null"] },
    totalAmount: { type: ["number", "null"] },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          supplierReference: { type: ["string", "null"] },
          quantity: { type: ["number", "null"] },
          unitCost: { type: ["number", "null"] },
          lineTotal: { type: ["number", "null"] },
        },
        required: ["description", "supplierReference", "quantity", "unitCost", "lineTotal"],
        additionalProperties: false,
      },
    },
    confidenceNote: { type: "string" },
  },
  required: ["supplierName", "invoiceNumber", "invoiceDate", "subtotal", "vatRate", "vatAmount", "totalAmount", "lines", "confidenceNote"],
  additionalProperties: false,
} as const;

export type RecognizedInvoice = {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  subtotal: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  lines: Array<{ description: string; supplierReference: string | null; quantity: number | null; unitCost: number | null; lineTotal: number | null }>;
  confidenceNote: string;
};

function safeFileName(fileName: string) {
  return (fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "invoice").slice(0, 180);
}

function getOutputText(payload: any) {
  if (typeof payload.output_text === "string") return payload.output_text;
  return payload.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text;
}

export async function recognizeInvoiceFile(input: { fileData: string; fileName: string; contentType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp" }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY no está configurada. Añádela en la configuración del VPS antes de reconocer facturas.");
  const baseUrl = (process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_INVOICE_MODEL ?? "gpt-5-mini";
  const base64Data = input.fileData.split(",")[1] || input.fileData;
  const fileBuffer = Buffer.from(base64Data, "base64");
  if (fileBuffer.length === 0) throw new Error("El documento recibido está vacío.");
  if (fileBuffer.length > 15 * 1024 * 1024) throw new Error("La factura supera el límite de 15 MB.");

  const uploadsDirectory = path.resolve(process.env.UPLOADS_DIR ?? "uploads", "invoices");
  await fs.mkdir(uploadsDirectory, { recursive: true });
  const localName = `${Date.now()}-${safeFileName(input.fileName)}`;
  await fs.writeFile(path.join(uploadsDirectory, localName), fileBuffer);

  const fileForm = new FormData();
  fileForm.append("purpose", "user_data");
  fileForm.append("file", new Blob([fileBuffer], { type: input.contentType }), safeFileName(input.fileName));
  const uploadResponse = await fetch(`${baseUrl}/files`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: fileForm });
  if (!uploadResponse.ok) throw new Error(`No se pudo enviar la factura al servicio de IA: ${await uploadResponse.text()}`);
  const uploadedFile = await uploadResponse.json() as { id: string };

  try {
    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: [
          { type: "input_text", text: "Extrae los datos de esta factura española. Usa null si no puedes leer un valor. El totalAmount debe ser el total final a pagar con impuestos, no una base parcial. Las cantidades deben ser positivas y los precios unitarios deben excluir impuestos cuando la factura lo permita. No inventes líneas ni valores." },
          { type: "input_file", file_id: uploadedFile.id },
        ] }],
        text: { format: { type: "json_schema", name: "sweet_salty_invoice", strict: true, schema: invoiceSchema } },
      }),
    });
    if (!response.ok) throw new Error(`No se pudo analizar la factura: ${await response.text()}`);
    const payload = await response.json();
    const outputText = getOutputText(payload);
    if (!outputText) throw new Error("El modelo no devolvió datos estructurados para la factura.");
    return { localUrl: `/uploads/invoices/${localName}`, fileName: localName, data: JSON.parse(outputText) as RecognizedInvoice };
  } finally {
    await fetch(`${baseUrl}/files/${uploadedFile.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => undefined);
  }
}
