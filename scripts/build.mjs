import { spawnSync } from "node:child_process";

const now = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date());

const env = {
  ...process.env,
  VITE_BUILD_LABEL: process.env.VITE_BUILD_LABEL || `Versión v1.0.2 · ${now}`,
};

const commands = [
  ["pnpm", ["exec", "vite", "build"]],
  ["pnpm", ["exec", "esbuild", "server/index.ts", "--platform=node", "--packages=external", "--bundle", "--format=esm", "--outdir=dist"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
