export type RiskLevel = "low" | "medium" | "high";
export type DecisionAction = "dispatch_now" | "schedule_dispatch" | "skip" | "human_review";

export interface FlexEvent {
  company_name?: string;
  fu_id?: string;
  zone?: string;
  product?: string;
  start_time_local?: string;
  end_time_local?: string;
  availability_mw_req?: number;
  utilisation_mw_req?: number;
  availability_price?: number;
  utilisation_price?: number;
  availability_mwh_req?: number;
  utilisation_mwh_req?: number;
  technology?: string;
  dispatch_type?: string;
  hours_requested?: number;
  dispatch_method?: string;
  start_time_utc?: string;
  end_time_utc?: string;
  time_utc?: string;
}

export interface PrivateData {
  companyProfile: unknown;
  depotOps: unknown;
  bessAssets: unknown;
}

export interface AgentDecision {
  action: DecisionAction;
  asset_id: string;
  power_kw: number;
  duration_minutes: number;
  risk_level: RiskLevel;
  confidence: "low" | "medium" | "high";
  rationale: string;
  human_review_required: boolean;
  settlement_evidence_notes: string;
}

export interface BatteryActionRequest {
  action_type: "dispatch_battery" | "schedule_battery_dispatch" | "no_action";
  asset_id: string;
  power_kw: number;
  duration_minutes: number;
  reason: string;
  event_id: string;
  risk_level: RiskLevel;
}

export interface BatteryActionResult {
  mode: "simulate" | "live";
  status: "accepted" | "skipped" | "failed";
  request: BatteryActionRequest;
  response?: unknown;
  error?: string;
}

export interface EvidenceRecord {
  run: number;
  timestamp: string;
  event: FlexEvent;
  decision: AgentDecision;
  batteryAction: BatteryActionResult;
}
