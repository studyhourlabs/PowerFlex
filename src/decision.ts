import { z } from "zod";
import type { AgentDecision, FlexEvent, PrivateData } from "./types.js";

export const AgentDecisionSchema = z.object({
  action: z.enum(["dispatch_now", "schedule_dispatch", "skip", "human_review"]),
  asset_id: z.string().min(1),
  power_kw: z.number().min(0),
  duration_minutes: z.number().min(0),
  risk_level: z.enum(["low", "medium", "high"]),
  confidence: z.enum(["low", "medium", "high"]),
  rationale: z.string().min(1),
  human_review_required: z.boolean(),
  settlement_evidence_notes: z.string().min(1)
});

export function fallbackDecision(event: FlexEvent, privateData: PrivateData): AgentDecision {
  const companyProfile = privateData.companyProfile as {
    policies?: {
      minimum_utilisation_price_gbp_per_mwh?: number;
      max_low_risk_power_kw?: number;
      max_auto_dispatch_duration_minutes?: number;
      human_review_required_for_risk?: string[];
    };
  };
  const bessAssets = privateData.bessAssets as {
    assets?: Array<{
      asset_id: string;
      status: string;
      state_of_charge_percent: number;
      max_discharge_kw: number;
      reserved_for_resilience_percent: number;
    }>;
  };

  const asset = bessAssets.assets?.[0];
  const policies = companyProfile.policies ?? {};
  const utilisationMw = Math.max(event.utilisation_mw_req ?? 0.06, 0.06);
  const requestedKw = Math.round(utilisationMw * 1000);
  const durationMinutes = Math.max(15, Math.round((event.hours_requested ?? 0.5) * 60));
  const minPrice = policies.minimum_utilisation_price_gbp_per_mwh ?? 300;
  const lowRiskPower = policies.max_low_risk_power_kw ?? 80;
  const maxDuration = policies.max_auto_dispatch_duration_minutes ?? 60;
  const enoughSoc =
    asset !== undefined &&
    asset.status === "available" &&
    asset.state_of_charge_percent > asset.reserved_for_resilience_percent + 10;
  const economicallyValid = (event.utilisation_price ?? 0) >= minPrice;
  const withinAutoBounds = requestedKw <= lowRiskPower && durationMinutes <= maxDuration;

  if (!asset || !enoughSoc || !economicallyValid) {
    return {
      action: "skip",
      asset_id: asset?.asset_id ?? "BESS-HAL-01",
      power_kw: 0,
      duration_minutes: 0,
      risk_level: "medium",
      confidence: "medium",
      rationale:
        "Skipped because the event does not satisfy the demo guardrails for asset availability, battery reserve, or minimum utilisation price.",
      human_review_required: false,
      settlement_evidence_notes: "No dispatch evidence required because no battery action was taken."
    };
  }

  if (!withinAutoBounds) {
    return {
      action: "human_review",
      asset_id: asset.asset_id,
      power_kw: Math.min(requestedKw, asset.max_discharge_kw),
      duration_minutes: durationMinutes,
      risk_level: "high",
      confidence: "medium",
      rationale:
        "The opportunity is attractive, but requested power or duration exceeds automatic dispatch guardrails, so a human operator must approve it.",
      human_review_required: true,
      settlement_evidence_notes:
        "Record event details, calculated limits, and approval requirement before any dispatch."
    };
  }

  return {
    action: "dispatch_now",
    asset_id: asset.asset_id,
    power_kw: Math.min(requestedKw, asset.max_discharge_kw),
    duration_minutes: durationMinutes,
    risk_level: "low",
    confidence: "high",
    rationale:
      "Dispatch is within BESS capability, preserves the configured reserve, avoids charger disruption, and meets the utilisation price threshold.",
    human_review_required: false,
    settlement_evidence_notes:
      "Capture event id, dispatch command, accepted action response, and timestamp for settlement evidence."
  };
}
