# UKPN Flexibility Dispatches Mock API

Tiny Node.js + TypeScript + Express mock service for a hackathon demo. It simulates the UKPN Flexibility Dispatches dataset endpoint with 5 local seed scenarios.

On startup the service:

- Loads 5 predefined scenario records from `src/data/seed-events.json` 
(copies the schema and historic data from https://ukpowernetworks.opendatasoft.com/explore/assets/ukpn-flexibility-dispatches/view/?page=1) - the only reason we're using this predefined wrapper is for demo cause we can't wait for the prod flex dispatch. However we made sure that the tech wise the flow is the same - Agent pools the API, schema is the same, endpoint is the same. 

Here's the swagger: https://ukpowernetworks.opendatasoft.com/api-console/explore/v2.1/catalog/datasets/ukpn-flexibility-dispatches/

- Returns only one latest event from the records endpoint
- Replaces the latest event every 60 seconds
- Loops through the 5 scenarios forever
- Keeps the returned record schema exactly the same as the UKPN dataset

Scenario loop:

- `00:00-00:59`: scenario 1, wrong location skipped case
- `01:00-01:59`: scenario 2, policy rejection
- `02:00-02:59`: scenario 3, intraday low-risk action and settlement document
- `03:00-03:59`: scenario 4, day-ahead low-risk operational changes and scheduled OCPP
- `04:00-04:59`: scenario 5, high risk human approval
- `05:00-05:59`: scenario 1 again

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

The service supports `PORT` and defaults to `3000`.

```bash
PORT=4000 npm run dev
```

## Build And Start

```bash
npm run build
npm start
```

## Endpoints

Health check:

```bash
curl http://localhost:3000/health
```

Mock UKPN flexibility dispatches records:

```bash
curl http://localhost:3000/catalog/datasets/ukpn-flexibility-dispatches/records
```

OCPP / Energy Asset Controller state:

```bash
curl http://localhost:3000/ocpp/state
```

Schedule an EV charger power limit:

```bash
curl -X POST http://localhost:3000/ocpp/actions \
  -H "Content-Type: application/json" \
  -d '{
    "action_type": "set_charger_power_limit",
    "asset_id": "CH-HAL-08",
    "power_limit_kw": 7,
    "reason": "Participating in Day-Ahead demand_turn_down event",
    "event_id": "demo-event-id",
    "scheduled_for": "2026-06-07T17:00:00.000Z",
    "risk_level": "low"
  }'
```

Dispatch the BESS battery:

```bash
curl -X POST http://localhost:3000/ocpp/actions \
  -H "Content-Type: application/json" \
  -d '{
    "action_type": "dispatch_battery",
    "asset_id": "BESS-HAL-01",
    "power_kw": 60,
    "duration_minutes": 30,
    "reason": "Intraday generation_turn_up event",
    "event_id": "demo-event-id",
    "risk_level": "low"
  }'
```

Try a refrigeration action, which is rejected by policy:

```bash
curl -X POST http://localhost:3000/ocpp/actions \
  -H "Content-Type: application/json" \
  -d '{
    "action_type": "shed_refrigeration_load",
    "asset_id": "REF-HAL-01",
    "reason": "Flexible site demand reduction",
    "event_id": "demo-event-id",
    "risk_level": "medium"
  }'
```

View simulated action logs:

```bash
curl http://localhost:3000/ocpp/action-logs
```

Reset OCPP state and logs:

```bash
curl -X POST http://localhost:3000/ocpp/reset
```

Example response:

```json
{
  "total_count": 1,
  "results": [
    {
      "company_name": "EDF Energy",
      "fu_id": "PowerShift - Norwich East Trowse Grid 33 Day-Ahead",
      "zone": "Trowse Grid 33",
      "product": "Day-Ahead",
      "start_time_local": "Sat, 30 May 2026 at 17:30",
      "end_time_local": "Sat, 30 May 2026 at 18:00",
      "availability_mw_req": 0,
      "utilisation_mw_req": 1,
      "availability_price": 0,
      "utilisation_price": 240,
      "availability_mwh_req": 0,
      "utilisation_mwh_req": 0.5,
      "technology": "Battery",
      "dispatch_type": "generation_turn_up",
      "hours_requested": 0.5,
      "dispatch_method": "epex",
      "start_time_utc": "2026-05-30T16:30:00.000Z",
      "end_time_utc": "2026-05-30T17:00:00.000Z",
      "time_utc": "16:30:00+00:00"
    }
  ]
}
```

## Render Deployment

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```

Environment variable:

```text
PORT supported, default 3000
```
