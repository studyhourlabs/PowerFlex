import { z } from "zod";

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
