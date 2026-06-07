import test from "node:test";
import assert from "node:assert/strict";
import { AgentDecisionSchema } from "../src/decision.js";

test("AgentDecisionSchema accepts valid OpenCLAW decision JSON", () => {
  const decision = AgentDecisionSchema.parse({
    action: "schedule_dispatch",
    asset_id: "BESS-HAL-01",
    power_kw: 60,
    duration_minutes: 30,
    risk_level: "low",
    confidence: "high",
    rationale: "BESS is available and the event is within guardrails.",
    human_review_required: false,
    settlement_evidence_notes: "Store event id, command response, and timestamp."
  });

  assert.equal(decision.action, "schedule_dispatch");
  assert.equal(decision.asset_id, "BESS-HAL-01");
});

test("AgentDecisionSchema rejects incomplete decision JSON", () => {
  const result = AgentDecisionSchema.safeParse({
    action: "dispatch_now",
    asset_id: "BESS-HAL-01"
  });

  assert.equal(result.success, false);
});
