import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function intEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  rootDir,
  outputDir: path.resolve(rootDir, "outputs"),
  flexEventsUrl:
    process.env.FLEX_EVENTS_URL ??
    "https://ukpn-flex-api.onrender.com/catalog/datasets/ukpn-flexibility-dispatches/records",
  batteryActionUrl:
    process.env.BATTERY_ACTION_URL ?? "https://ukpn-flex-api.onrender.com/ocpp/actions",
  privateCompanyProfileUrl:
    process.env.PRIVATE_COMPANY_PROFILE_URL ?? "http://localhost:8787/company-profile",
  privateDepotOpsUrl: process.env.PRIVATE_DEPOT_OPS_URL ?? "http://localhost:8787/depot-ops",
  privateBessAssetsUrl:
    process.env.PRIVATE_BESS_ASSETS_URL ?? "http://localhost:8787/bess-assets",
  assetId: process.env.ASSET_ID ?? "BESS-HAL-01",
  openClawAgentId: process.env.OPENCLAW_AGENT_ID ?? "main",
  openClawSessionKey: process.env.OPENCLAW_SESSION_KEY ?? "flex-demo",
  openClawThinking: process.env.OPENCLAW_THINKING ?? "high",
  openClawDryRun: boolEnv("OPENCLAW_DRY_RUN", false),
  actionApiMode: process.env.ACTION_API_MODE === "simulate" ? "simulate" : "live",
  telegramEnabled: boolEnv("TELEGRAM_ENABLED", false),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  demoRuns: intEnv("DEMO_RUNS", 5),
  demoIntervalMs: intEnv("DEMO_INTERVAL_MS", 60_000),
  agentInstructionsPath: path.resolve(rootDir, "AGENTS.md"),
  identityPath: path.resolve(rootDir, "IDENTITY.md")
} as const;
