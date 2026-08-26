import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiRouter } from "./routes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.set("trust proxy", 1);
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

const accessUser = process.env.POS_BASIC_USER;
const accessPassword = process.env.POS_BASIC_PASSWORD;
if (accessUser && accessPassword) {
  app.use((req, res, next) => {
    const header = req.headers.authorization ?? "";
    const encoded = header.startsWith("Basic ") ? header.slice(6) : "";
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    if (decoded === `${accessUser}:${accessPassword}`) return next();
    res.setHeader("WWW-Authenticate", 'Basic realm="Sweet & Salty POS"');
    res.status(401).send("Autenticación requerida");
  });
}

app.use("/api", apiRouter);
app.use("/uploads", express.static(path.resolve(process.env.UPLOADS_DIR ?? "uploads"), { maxAge: "1h" }));

const publicDirectory = path.resolve(__dirname, "public");
app.use(express.static(publicDirectory, { index: false, maxAge: "1h" }));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(publicDirectory, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const originalMessage = error instanceof Error ? error.message : "Error interno del servidor";
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
  const causeCode = cause && typeof cause === "object" && "code" in cause ? String((cause as { code?: unknown }).code) : "";
  let message = originalMessage;
  if (causeCode === "ER_NO_SUCH_TABLE") message = "Falta una tabla de la aplicación. Reinicia el TPV para que complete la preparación automática de la base de datos.";
  else if (causeCode === "ER_DUP_ENTRY") message = "Ya existe una promoción para ese artículo combo. El guardado debe actualizarla en lugar de duplicarla.";
  else if (causeCode === "ER_BAD_FIELD_ERROR") message = "La base de datos tiene una versión de columnas anterior. Aplica las migraciones pendientes y reinicia el TPV.";
  const status = /vacío|inválid|insuficiente|menor|cerrada|disponible|configurada|falta|existe una promoción|versión de columnas/i.test(message) ? 400 : 500;
  if (status === 500) console.error("[SweetSaltyPOS]", error);
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, "0.0.0.0", () => {
  console.log(`[SweetSaltyPOS] Disponible en el puerto ${port}`);
});
