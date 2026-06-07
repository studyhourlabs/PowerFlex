import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import {
  ActionLog,
  ActionRequest,
  ActionStatus,
  Charger,
  FlexDispatchRecord,
  OcppState,
  RecordsResponse,
  Vehicle
} from "./types";

type SeedData = {
  allEvents: FlexDispatchRecord[];
};

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(process.cwd(), "src", "data");
const SEED_FILE = path.join(DATA_DIR, "seed-events.json");
const OCPP_INITIAL_STATE_FILE = path.join(DATA_DIR, "ocpp-initial-state.json");
const ROTATE_INTERVAL_MS = 60_000;

const app = express();

app.use(cors());
app.use(express.json());

const readJsonFile = <T>(filePath: string): T => {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
};

const clone = <T>(value: T): T => {
  return JSON.parse(JSON.stringify(value)) as T;
};

const seedData = readJsonFile<SeedData>(SEED_FILE);
const allEvents = seedData.allEvents;
const initialOcppState = readJsonFile<OcppState>(OCPP_INITIAL_STATE_FILE);

let currentEventIndex = 0;
let ocppState = clone(initialOcppState);
let actionLogs: ActionLog[] = [];
let nextActionLogNumber = 1;

// Scenario 1, 00:00-00:59: wrong location (skipped case).
// Scenario 2, 01:00-01:59: policy rejection (right location, tempting price, but violates policy / evals).
// Scenario 3, 02:00-02:59: intraday (calcs risk -> low -> does the action and produces settlement doc).
// Scenario 4, 03:00-03:59: day-ahead (calc risk -> low -> suggests operational changes for the next 24 hours, schedules OCPP, then runs scheduled OCPP and generates report if not cancelled and predicted state matches).
// Scenario 5, 04:00-04:59: high risk / human approval (everything good but low certainty -> asks human).
// Scenario 1 repeats from 05:00 onward, looping these five records forever.
const getCurrentEvent = (eventIndex: number): FlexDispatchRecord => {
  return allEvents[eventIndex];
};

const exposeCurrentEvent = (): void => {
  console.log(`latest flex event exposed: scenario ${currentEventIndex + 1}`);
};

const getCurrentRecordsResponse = (): RecordsResponse => {
  return {
    total_count: 1,
    results: [getCurrentEvent(currentEventIndex)]
  };
};

const getStateResponse = (): OcppState => {
  return {
    ...ocppState,
    last_actions: actionLogs.slice(-10)
  };
};

const findCharger = (assetId: string): Charger | undefined => {
  return ocppState.chargers.find((charger) => charger.charger_id === assetId);
};

const findVehicleForCharger = (charger: Charger): Vehicle | undefined => {
  return ocppState.vehicles.find((vehicle) => vehicle.vehicle_id === charger.connected_vehicle_id);
};

const updateSiteImport = (deltaKw: number): void => {
  ocppState.depot.current_site_import_kw = Number(
    Math.max(0, ocppState.depot.current_site_import_kw + deltaKw).toFixed(3)
  );
};

const appendActionLog = (
  request: ActionRequest,
  status: ActionStatus,
  result: Record<string, unknown>
): ActionLog => {
  const actionLog: ActionLog = {
    action_log_id: `act_${String(nextActionLogNumber).padStart(4, "0")}`,
    timestamp_utc: new Date().toISOString(),
    event_id: request.event_id ?? null,
    action_type: request.action_type,
    asset_id: request.asset_id,
    status,
    request,
    result
  };

  nextActionLogNumber += 1;
  actionLogs.push(actionLog);
  return actionLog;
};

const actionResponse = (
  request: ActionRequest,
  status: ActionStatus,
  message: string,
  extra: Record<string, unknown> = {}
) => {
  const result = { message, ...extra };
  const actionLog = appendActionLog(request, status, result);

  return {
    success: status === "executed" || status === "scheduled",
    status,
    requires_human_approval: status === "requires_human_approval",
    message,
    action_log_id: actionLog.action_log_id,
    ...extra
  };
};

const setChargerPowerLimit = (request: ActionRequest) => {
  const charger = findCharger(request.asset_id);

  if (!charger) {
    return actionResponse(request, "rejected", `Asset ${request.asset_id} not found.`);
  }

  if (typeof request.power_limit_kw !== "number") {
    return actionResponse(request, "rejected", "power_limit_kw is required for set_charger_power_limit.");
  }

  if (request.power_limit_kw < charger.min_power_kw || request.power_limit_kw > charger.max_power_kw) {
    return actionResponse(
      request,
      "rejected",
      `Requested power limit must be between ${charger.min_power_kw}kW and ${charger.max_power_kw}kW.`,
      { min_power_kw: charger.min_power_kw, max_power_kw: charger.max_power_kw }
    );
  }

  const vehicle = findVehicleForCharger(charger);
  const touchesCriticalVehicle = Boolean(vehicle && (!vehicle.can_flex || vehicle.route_priority === "critical"));

  if (touchesCriticalVehicle && request.risk_level === "high") {
    return actionResponse(
      request,
      "requires_human_approval",
      "Critical route / SOC protection requires human approval before throttling this charger.",
      { vehicle }
    );
  }

  if (touchesCriticalVehicle) {
    return actionResponse(
      request,
      "rejected",
      "Critical route / SOC protection blocks autonomous throttling for this charger.",
      { vehicle }
    );
  }

  const isScheduled = Boolean(request.scheduled_for);
  const previousPowerKw = charger.current_power_kw;
  charger.last_command = `set_charger_power_limit:${request.power_limit_kw}`;

  if (isScheduled) {
    return actionResponse(
      request,
      "scheduled",
      `Charger power limit scheduled for ${request.scheduled_for}.`,
      { scheduled_for: request.scheduled_for, previous_power_kw: previousPowerKw }
    );
  }

  charger.current_power_kw = request.power_limit_kw;
  charger.ocpp_status = request.power_limit_kw === 0 ? "SuspendedEVSE" : "Charging";
  updateSiteImport(request.power_limit_kw - previousPowerKw);

  return actionResponse(request, "executed", "Charger power limit applied.", {
    previous_power_kw: previousPowerKw,
    current_power_kw: charger.current_power_kw
  });
};

const dispatchBattery = (request: ActionRequest) => {
  if (request.asset_id !== ocppState.bess.asset_id) {
    return actionResponse(request, "rejected", `Asset ${request.asset_id} not found.`);
  }

  if (typeof request.power_kw !== "number" || typeof request.duration_minutes !== "number") {
    return actionResponse(request, "rejected", "power_kw and duration_minutes are required for dispatch_battery.");
  }

  if (request.power_kw > ocppState.bess.max_discharge_kw) {
    return actionResponse(
      request,
      "rejected",
      `Requested battery dispatch exceeds max available discharge of ${ocppState.bess.max_discharge_kw}kW.`,
      { max_available_kw: ocppState.bess.max_discharge_kw }
    );
  }

  const energyKwh = (request.power_kw * request.duration_minutes) / 60;
  const socDropPct = (energyKwh / ocppState.bess.capacity_kwh) * 100;
  const projectedSocPct = ocppState.bess.state_of_charge_pct - socDropPct;

  if (projectedSocPct < ocppState.bess.min_state_of_charge_pct) {
    return actionResponse(
      request,
      "rejected",
      "Battery dispatch would breach minimum SOC policy.",
      {
        projected_state_of_charge_pct: Number(projectedSocPct.toFixed(2)),
        min_state_of_charge_pct: ocppState.bess.min_state_of_charge_pct
      }
    );
  }

  ocppState.bess.current_power_kw = request.power_kw;
  ocppState.bess.state_of_charge_pct = Number(projectedSocPct.toFixed(2));
  ocppState.bess.status = "Discharging";
  ocppState.bess.last_command = `dispatch_battery:${request.power_kw}`;
  updateSiteImport(-request.power_kw);

  return actionResponse(request, "executed", "Battery dispatch executed.", {
    energy_kwh: Number(energyKwh.toFixed(2)),
    state_of_charge_pct: ocppState.bess.state_of_charge_pct
  });
};

const setHvacMode = (request: ActionRequest) => {
  const hvac = ocppState.hvac.find((asset) => asset.asset_id === request.asset_id);

  if (!hvac) {
    return actionResponse(request, "rejected", `Asset ${request.asset_id} not found.`);
  }

  if (request.mode !== "eco" && request.mode !== "normal") {
    return actionResponse(request, "rejected", "mode must be eco or normal for set_hvac_mode.");
  }

  if (hvac.temperature_c < hvac.min_temperature_c || hvac.temperature_c > hvac.max_temperature_c) {
    return actionResponse(request, "rejected", "HVAC temperature is outside the allowed operating range.");
  }

  const previousPowerKw = hvac.current_power_kw;
  hvac.mode = request.mode;
  hvac.current_power_kw = request.mode === "eco" ? Math.max(0, previousPowerKw - 6) : 18;
  updateSiteImport(hvac.current_power_kw - previousPowerKw);

  return actionResponse(request, "executed", `HVAC mode set to ${request.mode}.`, {
    previous_power_kw: previousPowerKw,
    current_power_kw: hvac.current_power_kw
  });
};

const shedRefrigerationLoad = (request: ActionRequest) => {
  const refrigeration = ocppState.refrigeration.find((asset) => asset.asset_id === request.asset_id);

  if (!refrigeration) {
    return actionResponse(request, "rejected", `Asset ${request.asset_id} not found.`);
  }

  return actionResponse(
    request,
    "rejected",
    "Autonomous refrigeration shedding is blocked by cold-chain policy.",
    { policy_reason: refrigeration.reason }
  );
};

const handleAction = (request: ActionRequest) => {
  if (!request || typeof request.action_type !== "string" || typeof request.asset_id !== "string") {
    const fallbackRequest: ActionRequest = {
      action_type: request?.action_type ?? "unknown",
      asset_id: request?.asset_id ?? "unknown"
    };

    return actionResponse(fallbackRequest, "rejected", "action_type and asset_id are required.");
  }

  switch (request.action_type) {
    case "set_charger_power_limit":
      return setChargerPowerLimit(request);
    case "dispatch_battery":
      return dispatchBattery(request);
    case "set_hvac_mode":
      return setHvacMode(request);
    case "shed_refrigeration_load":
      return shedRefrigerationLoad(request);
    default:
      return actionResponse(request, "rejected", `Unsupported action_type ${request.action_type}.`);
  }
};

console.log("service started");
exposeCurrentEvent();

setInterval(() => {
  currentEventIndex += 1;

  if (currentEventIndex >= allEvents.length) {
    currentEventIndex = 0;
    console.log("all 5 scenarios exposed; looping back to scenario 1");
  }

  exposeCurrentEvent();
}, ROTATE_INTERVAL_MS);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/catalog/datasets/ukpn-flexibility-dispatches/records", (_req, res) => {
  res.json(getCurrentRecordsResponse());
});

app.get("/ocpp/state", (_req, res) => {
  res.json(getStateResponse());
});

app.post("/ocpp/actions", (req, res) => {
  res.json(handleAction(req.body as ActionRequest));
});

app.get("/ocpp/action-logs", (_req, res) => {
  res.json({ total_count: actionLogs.length, results: actionLogs });
});

app.post("/ocpp/reset", (_req, res) => {
  ocppState = clone(initialOcppState);
  actionLogs = [];
  nextActionLogNumber = 1;
  res.json({ success: true, message: "OCPP state and action logs reset." });
});

app.listen(PORT, () => {
  console.log(`mock API listening on port ${PORT}`);
});
