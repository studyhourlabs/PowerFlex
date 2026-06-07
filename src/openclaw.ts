import { execFile } from "node:child_process";
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

  return parseOpenClawDecision(stdout);
}

function buildPrompt(input: {
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
    "Return strict JSON with this shape:",
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
    )
  ].join("\n");
}

function parseOpenClawDecision(stdout: string): AgentDecision {
  const wrapper = parseJsonObject(stdout);
  const candidate =
    getNestedText(wrapper, ["result", "finalAssistantVisibleText"]) ??
    getNestedText(wrapper, ["result", "finalAssistantRawText"]) ??
    getNestedText(wrapper, ["result", "payloads", "0", "text"]) ??
    stdout;

  const parsed = parseJsonObject(candidate);
  return AgentDecisionSchema.parse(parsed);
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error("PowerFlex agent output did not include a JSON object");
    }
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as unknown;
  }
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
