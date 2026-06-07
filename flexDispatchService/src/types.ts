export type FlexDispatchRecord = {
  company_name: string;
  fu_id: string;
  zone: string;
  product: string;
  start_time_local: string;
  end_time_local: string;
  availability_mw_req: number;
  utilisation_mw_req: number;
  availability_price: number;
  utilisation_price: number;
  availability_mwh_req: number;
  utilisation_mwh_req: number;
  technology: string;
  dispatch_type: string;
  hours_requested: number;
  dispatch_method: string;
  start_time_utc: string;
  end_time_utc: string;
  time_utc: string;
};

export type RecordsResponse = {
  total_count: number;
  results: FlexDispatchRecord[];
};

export type Depot = {
  depot_id: string;
  name: string;
  zone: string;
  postcode: string;
  registered_flex_zone: string;
  site_import_limit_kw: number;
  current_site_import_kw: number;
  baseline_site_import_kw: number;
  local_timezone: string;
};

export type Charger = {
  charger_id: string;
  asset_type: "ev_charger";
  ocpp_status: string;
  connected_vehicle_id: string | null;
  current_power_kw: number;
  max_power_kw: number;
  min_power_kw: number;
  last_command: string | null;
};

export type Vehicle = {
  vehicle_id: string;
  connected_charger_id: string;
  state_of_charge_pct: number;
  target_state_of_charge_pct: number;
  battery_capacity_kwh: number;
  departure_time_local: string;
  route_id: string;
  route_priority: "critical" | "standard" | "flexible";
  can_flex: boolean;
  reason?: string;
};

export type Bess = {
  asset_id: string;
  asset_type: "battery";
  state_of_charge_pct: number;
  capacity_kwh: number;
  current_power_kw: number;
  max_discharge_kw: number;
  max_charge_kw: number;
  min_state_of_charge_pct: number;
  status: string;
  last_command: string | null;
};

export type HvacAsset = {
  asset_id: string;
  asset_type: "hvac";
  current_power_kw: number;
  mode: string;
  temperature_c: number;
  min_temperature_c: number;
  max_temperature_c: number;
  can_flex: boolean;
};

export type RefrigerationAsset = {
  asset_id: string;
  asset_type: "refrigeration";
  current_power_kw: number;
  temperature_c: number;
  min_temperature_c: number;
  max_temperature_c: number;
  can_flex: boolean;
  reason: string;
};

export type OcppState = {
  depot: Depot;
  chargers: Charger[];
  vehicles: Vehicle[];
  bess: Bess;
  hvac: HvacAsset[];
  refrigeration: RefrigerationAsset[];
  constraints: string[];
  last_actions: ActionLog[];
};

export type ActionRequest = {
  action_type: string;
  asset_id: string;
  event_id?: string;
  reason?: string;
  risk_level?: "low" | "medium" | "high";
  scheduled_for?: string;
  power_limit_kw?: number;
  power_kw?: number;
  duration_minutes?: number;
  mode?: string;
};

export type ActionStatus = "executed" | "scheduled" | "rejected" | "requires_human_approval";

export type ActionLog = {
  action_log_id: string;
  timestamp_utc: string;
  event_id: string | null;
  action_type: string;
  asset_id: string;
  status: ActionStatus;
  request: ActionRequest;
  result: Record<string, unknown>;
};
