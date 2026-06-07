import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "./config.js";
import { AgentDecisionSchema } from "./decision.js";
import type { AgentDecision, FlexEvent, PrivateData } from "./types.js";

const execFileAsync = promisify(execFile);

export async function askOpenClawForDecision(input: {
  run: number;
  event: FlexEvent;
  privateData: PrivateData;
  agentFiles: { agents: string; identity: string };
}): Promise<AgentDecision> {
  const prompt = buildPrompt(input);

  if (config.openClawDryRun) {
    throw new Error("OPENCLAW_DRY_RUN=true is disabled for the real PowerFlex workflow");
  }

  const { stdout } = await execFileAsync(
    "openclaw",
    [
      "agent",
      "--agent",
      config.openClawAgentId,
      "--session-key",
      config.openClawSessionKey,
      "--thinking",
      config.openClawThinking,
      "--message",
      prompt,
      "--json"
    ],
    { maxBuffer: 1024 * 1024 * 5 }
  );

  return parseOpenClawDecision(stdout, input.run);
}

export function buildPrompt(input: {
  run: number;
  event: FlexEvent;
  privateData: PrivateData;
  agentFiles: { agents: string; identity: string };
}): string {
  return [
    "You are running the PowerFlex flex decision workflow.",
    `Demo run: ${input.run}`,
    "",
    "Follow these agent instructions:",
    input.agentFiles.agents,
    "",
    "Identity:",
    input.agentFiles.identity,
    "",
    "Public flex event:",
    JSON.stringify(input.event, null, 2),
    "",
    "Private company/depot/BESS API data:",
    JSON.stringify(input.privateData, null, 2),
    "",
    "Return only one strict JSON object. Do not wrap it in markdown. Do not add prose before or after it.",
    "The JSON object must have this exact shape:",
    JSON.stringify(
      {
        action: "dispatch_now | schedule_dispatch | skip | human_review",
        asset_id: "BESS-HAL-01",
        power_kw: 60,
        duration_minutes: 30,
        risk_level: "low | medium | high",
        confidence: "low | medium | high",
        rationale: "short reason",
        human_review_required: false,
        settlement_evidence_notes: "what to store for audit"
      },
      null,
      2
    ),
    "",
    "Important: the top-level JSON object must contain action, asset_id, power_kw, duration_minutes, risk_level, confidence, rationale, human_review_required, and settlement_evidence_notes."
  ].join("\n");
}

async function writeDebugOutput(run: number, stdout: string, parsed: unknown): Promise<void> {
  if (process.env.POWERFLEX_DEBUG_OPENCLAW !== "true") {
    return;
  }

  await fs.mkdir(config.outputDir, { recursive: true });
  await fs.writeFile(
    path.join(config.outputDir, `openclaw-raw-run-${run}.json`),
    JSON.stringify({ stdout, parsed }, null, 2),
    "utf8"
  );
}

async function parseOpenClawDecision(stdout: string, run: number): Promise<AgentDecision> {
  const wrapper = parseJsonObject(stdout);
  const candidates = [
    getNestedText(wrapper, ["result", "finalAssistantVisibleText"]),
    getNestedText(wrapper, ["result", "finalAssistantRawText"]),
    getNestedText(wrapper, ["result", "payloads", "0", "text"]),
    ...collectJsonLikeStrings(wrapper),
    stdout
  ].filter((candidate): candidate is string => candidate !== undefined);

  for (const candidate of candidates) {
    const parsed = parseJsonObject(candidate);
    const direct = AgentDecisionSchema.safeParse(parsed);
    if (direct.success) {
      return direct.data;
    }

    const nested = findDecisionObject(parsed);
    if (nested) {
      return nested;
    }
  }

  await writeDebugOutput(run, stdout, wrapper);
  throw new Error(
    `OpenCLAW returned JSON, but no valid PowerFlex decision was found. Set POWERFLEX_DEBUG_OPENCLAW=true to write outputs/openclaw-raw-run-${run}.json`
  );
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      const fenced = extractFencedJson(trimmed);
      if (fenced) {
        return JSON.parse(fenced) as unknown;
      }
      throw new Error("PowerFlex agent output did not include a JSON object");
    }
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as unknown;
  }
}

function extractFencedJson(text: string): string | undefined {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim();
}

function collectJsonLikeStrings(value: unknown): string[] {
  const strings: string[] = [];

  function visit(current: unknown): void {
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (trimmed.includes("{") && trimmed.includes("}")) {
        strings.push(trimmed);
      }
      return;
    }

    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }

    if (current !== null && typeof current === "object") {
      Object.values(current).forEach(visit);
    }
  }

  visit(value);
  return strings;
}

function findDecisionObject(value: unknown): AgentDecision | undefined {
  const direct = AgentDecisionSchema.safeParse(value);
  if (direct.success) {
    return direct.data;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDecisionObject(item);
      if (found) return found;
    }
    return undefined;
  }

  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = findDecisionObject(item);
      if (found) return found;
    }
  }

  return undefined;
}

function getNestedText(value: unknown, path: string[]): string | undefined {
  let current = value;
  for (const part of path) {
    if (Array.isArray(current)) {
      current = current[Number(part)];
    } else if (current !== null && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  if (typeof current !== "string") {
    return undefined;
  }

  const trimmed = current.trim();
  if (!trimmed.startsWith("{")) {
    throw new Error("PowerFlex agent output did not include a JSON object");
  }
  return trimmed;
}
