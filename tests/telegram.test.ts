import test from "node:test";
import assert from "node:assert/strict";
import { formatTelegramMessage } from "../src/telegram.js";
import type { EvidenceRecord } from "../src/types.js";

test("formatTelegramMessage contains decision and evidence summary", () => {
  const record: EvidenceRecord = {
    run: 1,
    timestamp: "2026-06-07T12:00:00.000Z",
    event: {
      fu_id: "OVO-HALS-DA-3793",
      zone: "Halstead",
      product: "Day-Ahead",
      dispatch_type: "demand_turn_down"
    },
    decision: {
      action: "dispatch_now",
      asset_id: "BESS-HAL-01",
      power_kw: 60,
      duration_minutes: 30,
      risk_level: "low",
      confidence: "high",
      rationale: "Within guardrails.",
      human_review_required: false,
      settlement_evidence_notes: "Capture command and timestamp."
    },
    batteryAction: {
      mode: "simulate",
      status: "accepted",
      request: {
        action_type: "dispatch_battery",
        asset_id: "BESS-HAL-01",
        power_kw: 60,
        duration_minutes: 30,
        reason: "Within guardrails.",
        event_id: "OVO-HALS-DA-3793",
        risk_level: "low"
      }
    }
  };

  const message = formatTelegramMessage(record);

  assert.match(message, /PowerFlex Decision 1\/5/);
  assert.match(message, /Decision: DISPATCH_NOW/);
  assert.match(message, /Evidence: Capture command and timestamp/);
});
