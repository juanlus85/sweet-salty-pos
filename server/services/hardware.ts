import { setTimeout as delay } from "node:timers/promises";

export type DrawerStatus = {
  supported: boolean;
  mode: "disabled" | "bridge";
  message: string;
};

export function getDrawerStatus(): DrawerStatus {
  const bridgeUrl = process.env.CASH_DRAWER_BRIDGE_URL?.trim();
  if (!bridgeUrl) return { supported: false, mode: "disabled", message: "No hay un puente de cajón configurado. El TPV seguirá funcionando sin abrir hardware." };
  return { supported: true, mode: "bridge", message: "Cajón disponible mediante el puente configurado." };
}

export async function openCashDrawer(input: { reason?: "cash_sale" | "manual" }) {
  const bridgeUrl = process.env.CASH_DRAWER_BRIDGE_URL?.trim();
  if (!bridgeUrl) return { ...getDrawerStatus(), opened: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.CASH_DRAWER_BRIDGE_TOKEN ? { Authorization: `Bearer ${process.env.CASH_DRAWER_BRIDGE_TOKEN}` } : {}) },
      body: JSON.stringify({ action: "open-drawer", reason: input.reason ?? "manual" }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`El puente respondió ${response.status}.`);
    return { ...getDrawerStatus(), opened: true };
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeDrawerBridge() {
  await delay(1);
  return getDrawerStatus();
}
