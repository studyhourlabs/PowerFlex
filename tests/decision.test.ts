import test from "node:test";
import assert from "node:assert/strict";
import { fallbackDecision } from "../src/decision.js";
import type { FlexEvent, PrivateData } from "../src/types.js";

const privateData: PrivateData = {
  companyProfile: {
    policies: {
      minimum_utilisation_price_gbp_per_mwh: 300,
      max_low_risk_power_kw: 80,
      max_auto_dispatch_duration_minutes: 60
    }
  },
  depotOps: {},
  bessAssets: {
    assets: [
      {
        asset_id: "BESS-HAL-01",
        status: "available",
        state_of_charge_percent: 72,
        max_discharge_kw: 100,
        reserved_for_resilience_percent: 35
      }
    ]
  }
};

test("fallbackDecision dispatches low-risk economic events", () => {
  const event: FlexEvent = {
    fu_id: "event-1",
    utilisation_mw_req: 0.06,
    utilisation_price: 1200,
    hours_requested: 0.5
  };

  const decision = fallbackDecision(event, privateData);

  assert.equal(decision.action, "dispatch_now");
  assert.equal(decision.risk_level, "low");
  assert.equal(decision.power_kw, 60);
  assert.equal(decision.duration_minutes, 30);
  assert.equal(decision.human_review_required, false);
});

test("fallbackDecision escalates oversized events to human review", () => {
  const event: FlexEvent = {
    fu_id: "event-2",
    utilisation_mw_req: 0.15,
    utilisation_price: 1200,
    hours_requested: 1
  };

  const decision = fallbackDecision(event, privateData);

  assert.equal(decision.action, "human_review");
  assert.equal(decision.risk_level, "high");
  assert.equal(decision.human_review_required, true);
});

test("fallbackDecision skips uneconomic events", () => {
  const event: FlexEvent = {
    fu_id: "event-3",
    utilisation_mw_req: 0.06,
    utilisation_price: 50,
    hours_requested: 0.5
  };

  const decision = fallbackDecision(event, privateData);

  assert.equal(decision.action, "skip");
  assert.equal(decision.power_kw, 0);
});
