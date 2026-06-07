import { config } from "./config.js";
import type { EvidenceRecord } from "./types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function sendTelegram(record: EvidenceRecord): Promise<void> {
  const message = formatTelegramMessage(record);

  if (!config.telegramEnabled) {
    console.log(`\n--- Telegram disabled; message preview ---\n${message}\n`);
    return;
  }

  if (!config.telegramBotToken || !config.telegramChatId) {
    throw new Error("TELEGRAM_ENABLED=true requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID");
  }

  const payload = {
    chat_id: config.telegramChatId,
    text: message,
    disable_web_page_preview: true
  };

  try {
    await sendTelegramWithFetch(config.telegramBotToken, payload);
  } catch (error) {
    const detail = describeError(error);
    console.warn(`Telegram fetch send failed; retrying with curl. ${detail}`);
    try {
      await sendTelegramWithCurl(config.telegramBotToken, payload);
    } catch (curlError) {
      console.warn(`Telegram curl send failed after retries. ${describeError(curlError)}`);
      console.warn("Continuing demo because action and evidence were already recorded.");
    }
  }
}

async function sendTelegramWithFetch(
  token: string,
  payload: { chat_id: string; text: string; disable_web_page_preview: boolean }
): Promise<void> {
  const response = await retry("telegram fetch", async () =>
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram send failed: ${response.status} ${body}`);
  }
}

async function sendTelegramWithCurl(
  token: string,
  payload: { chat_id: string; text: string; disable_web_page_preview: boolean }
): Promise<void> {
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-sS",
      "-m",
      "30",
      "--retry",
      "3",
      "--retry-delay",
      "2",
      "--retry-all-errors",
      "-X",
      "POST",
      `https://api.telegram.org/bot${token}/sendMessage`,
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify(payload)
    ],
    { maxBuffer: 1024 * 1024 }
  );
  const response = JSON.parse(stdout) as { ok?: boolean; description?: string };
  if (!response.ok) {
    throw new Error(`Telegram curl send failed: ${response.description ?? stdout}`);
  }
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` Cause: ${error.cause.message}` : "";
  return `${error.message}${cause}`;
}

async function retry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        console.warn(`${label} attempt ${attempt} failed; retrying. ${describeError(error)}`);
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
    }
  }
  throw lastError;
}

export function formatTelegramMessage(record: EvidenceRecord): string {
  return [
    `PowerFlex Decision ${record.run}/5`,
    "",
    `Event: ${record.event.fu_id ?? "unknown"} (${record.event.zone ?? "unknown"})`,
    `Product: ${record.event.product ?? "unknown"} / ${record.event.dispatch_type ?? "unknown"}`,
    `Decision: ${record.decision.action.toUpperCase()}`,
    `Asset: ${record.decision.asset_id}`,
    `Power: ${record.decision.power_kw} kW for ${record.decision.duration_minutes} min`,
    `Risk: ${record.decision.risk_level}`,
    `Confidence: ${record.decision.confidence}`,
    `Human review: ${record.decision.human_review_required ? "yes" : "no"}`,
    "",
    `Reason: ${record.decision.rationale}`,
    "",
    `Battery action: ${record.batteryAction.status} (${record.batteryAction.mode})`,
    `Evidence: ${record.decision.settlement_evidence_notes}`
  ].join("\n");
}
