import { config } from "./config.js";
import type { AgentDecision, BatteryActionRequest, BatteryActionResult, FlexEvent } from "./types.js";

export async function submitBatteryAction(
  event: FlexEvent,
  decision: AgentDecision
): Promise<BatteryActionResult> {
  const request = createBatteryActionRequest(event, decision);

  if (request.action_type === "no_action") {
    return { mode: config.actionApiMode, status: "skipped", request };
  }

  if (config.actionApiMode !== "live") {
    return {
      mode: "simulate",
      status: "accepted",
      request,
      response: {
        simulated: true,
        accepted_at: new Date().toISOString()
      }
    };
  }

  try {
    const response = await fetch(config.batteryActionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    const body = await response.json().catch(() => undefined);

    return {
      mode: "live",
      status: response.ok ? "accepted" : "failed",
      request,
      response: body
    };
  } catch (error) {
    return {
      mode: "live",
      status: "failed",
      request,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function createBatteryActionRequest(
  event: FlexEvent,
  decision: AgentDecision
): BatteryActionRequest {
  const eventId = event.fu_id ?? `${event.zone ?? "unknown"}-${event.start_time_utc ?? Date.now()}`;

  if (decision.action === "skip" || decision.action === "human_review") {
    return {
      action_type: "no_action",
      asset_id: decision.asset_id,
      power_kw: 0,
      duration_minutes: 0,
      reason: decision.rationale,
      event_id: eventId,
      risk_level: decision.risk_level
    };
  }

  return {
    action_type:
      decision.action === "schedule_dispatch" ? "schedule_battery_dispatch" : "dispatch_battery",
    asset_id: decision.asset_id,
    power_kw: decision.power_kw,
    duration_minutes: decision.duration_minutes,
    reason: `${event.product ?? "Flex"} ${event.dispatch_type ?? "dispatch"} event: ${decision.rationale}`,
    event_id: eventId,
    risk_level: decision.risk_level
  };
}
