import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { EvidenceRecord } from "./types.js";

const evidenceCsvPath = path.join(config.outputDir, "powerflex-settlement-evidence.csv");
const dashboardPath = path.join(config.outputDir, "powerflex-flex-dashboard.html");

export async function appendEvidence(record: EvidenceRecord): Promise<{
  csvPath: string;
  dashboardPath: string;
}> {
  await fs.mkdir(config.outputDir, { recursive: true });

  const exists = await fileExists(evidenceCsvPath);
  const row = toCsvRow(record);
  await fs.appendFile(evidenceCsvPath, `${exists ? "" : `${csvHeader()}\n`}${row}\n`);
  await fs.writeFile(dashboardPath, renderDashboard(record), "utf8");

  return { csvPath: evidenceCsvPath, dashboardPath };
}

function csvHeader(): string {
  return [
    "run",
    "timestamp",
    "event_id",
    "zone",
    "product",
    "dispatch_type",
    "start_time_utc",
    "end_time_utc",
    "utilisation_mw_req",
    "utilisation_price",
    "action",
    "asset_id",
    "power_kw",
    "duration_minutes",
    "risk_level",
    "confidence",
    "human_review_required",
    "battery_action_mode",
    "battery_action_status",
    "rationale"
  ].join(",");
}

function toCsvRow(record: EvidenceRecord): string {
  const values = [
    record.run,
    record.timestamp,
    record.event.fu_id,
    record.event.zone,
    record.event.product,
    record.event.dispatch_type,
    record.event.start_time_utc,
    record.event.end_time_utc,
    record.event.utilisation_mw_req,
    record.event.utilisation_price,
    record.decision.action,
    record.decision.asset_id,
    record.decision.power_kw,
    record.decision.duration_minutes,
    record.decision.risk_level,
    record.decision.confidence,
    record.decision.human_review_required,
    record.batteryAction.mode,
    record.batteryAction.status,
    record.decision.rationale
  ];

  return values.map(csvEscape).join(",");
}

function renderDashboard(record: EvidenceRecord): string {
  const safe = {
    eventId: escapeHtml(record.event.fu_id ?? "unknown"),
    zone: escapeHtml(record.event.zone ?? "unknown"),
    product: escapeHtml(record.event.product ?? "unknown"),
    dispatchType: escapeHtml(record.event.dispatch_type ?? "unknown"),
    action: escapeHtml(record.decision.action),
    asset: escapeHtml(record.decision.asset_id),
    risk: escapeHtml(record.decision.risk_level),
    confidence: escapeHtml(record.decision.confidence),
    rationale: escapeHtml(record.decision.rationale),
    evidence: escapeHtml(record.decision.settlement_evidence_notes),
    actionStatus: escapeHtml(record.batteryAction.status),
    actionMode: escapeHtml(record.batteryAction.mode),
    actionType: escapeHtml(record.batteryAction.request.action_type)
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PowerFlex Evidence</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6f8;
      --ink: #16202a;
      --muted: #687586;
      --line: #d9e1ea;
      --panel: #ffffff;
      --accent: #e4583f;
      --accent-soft: #fff0ec;
      --ok: #177a56;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0;
      color: var(--ink);
      background:
        linear-gradient(180deg, #ffffff 0, var(--bg) 260px),
        var(--bg);
    }
    main { max-width: 1040px; margin: 0 auto; padding: 34px 20px 42px; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 18px;
      padding-bottom: 22px;
      border-bottom: 1px solid var(--line);
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .lobster {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      background: var(--accent-soft);
      border: 1px solid #ffd4ca;
      font-size: 22px;
    }
    h1 { font-size: 30px; line-height: 1.1; margin: 0 0 6px; letter-spacing: 0; }
    .muted { color: var(--muted); }
    .status {
      min-width: 136px;
      padding: 9px 12px;
      border-radius: 999px;
      color: var(--ok);
      background: #eaf7f1;
      border: 1px solid #bfe8d6;
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: .04em;
    }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 22px 0; }
    .panel, section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 10px 28px rgba(22, 32, 42, .06);
    }
    .panel { padding: 16px; }
    .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; font-weight: 700; }
    .value { font-size: 22px; font-weight: 750; margin-top: 7px; overflow-wrap: anywhere; }
    section { padding: 18px; margin-top: 14px; }
    p { margin: 9px 0 0; line-height: 1.55; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 720px) {
      main { padding: 22px 14px 32px; }
      header { flex-direction: column; }
      .grid, .two-col { grid-template-columns: 1fr; }
      .status { min-width: 0; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand">
        <div class="lobster" aria-label="PowerFlex lobster icon">🦞</div>
        <div>
          <h1>PowerFlex Evidence</h1>
          <div class="muted">Run ${record.run} generated ${escapeHtml(record.timestamp)}</div>
        </div>
      </div>
      <div class="status">${safe.actionStatus}</div>
    </header>
    <div class="grid">
      <div class="panel"><div class="label">Decision</div><div class="value">${safe.action}</div></div>
      <div class="panel"><div class="label">Risk</div><div class="value">${safe.risk}</div></div>
      <div class="panel"><div class="label">Asset</div><div class="value">${safe.asset}</div></div>
    </div>
    <div class="two-col">
      <section>
        <div class="label">Flex Event</div>
        <p>${safe.eventId} in ${safe.zone}: ${safe.product} / ${safe.dispatchType}</p>
      </section>
      <section>
        <div class="label">Control Action</div>
        <p>${safe.actionType} ${record.batteryAction.request.power_kw} kW for ${record.batteryAction.request.duration_minutes} minutes. Status: ${safe.actionStatus} (${safe.actionMode}).</p>
      </section>
    </div>
    <section>
      <div class="label">Rationale</div>
      <p>${safe.rationale}</p>
    </section>
    <section>
      <div class="label">Settlement Evidence Notes</div>
      <p>${safe.evidence}</p>
    </section>
  </main>
</body>
</html>`;
}

function csvEscape(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
