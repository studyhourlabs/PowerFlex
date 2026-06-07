# PowerFlex Demo

https://youtu.be/1skbM7RkNg8?si=tNBe11Y5_Q8IanGp

This project demonstrates a PowerFlex workflow for deciding and executing depot battery flexibility actions.

The TypeScript code handles deterministic orchestration. The OpenCLAW harness handles the reasoning decision. APIs handle all external data and actions.

## Overall Logic

Each run does this:

1. Fetch public flex events from the UKPN demo API.
2. Fetch private company, depot, and BESS data from private APIs.
3. Send the flex event plus private data to the PowerFlex agent.
4. Receive a strict JSON decision:
   - `dispatch_now`
   - `schedule_dispatch`
   - `skip`
   - `human_review`
5. POST the charger/battery action to the battery API when appropriate.
6. Write settlement evidence to CSV.
7. Refresh a small HTML evidence dashboard.
8. Send a Telegram summary.
9. Repeat five times.

The private data path is API-only. The workflow does not read private depot/BESS data from local files.

## Business Logic

The public flex API only describes the market/event request:

- event id
- zone
- start/end time
- requested MW/MWh
- utilisation price
- dispatch type

That is not enough to safely decide whether the depot should participate. The workflow also needs private company/depot/BESS context:

- BESS availability
- battery state of charge
- max charge/discharge limits
- minimum reserve requirement
- site import/export limits
- depot blackout windows
- business price threshold
- human-review rules

The decision logic combines both:

```text
public flex event + private depot/BESS data -> PowerFlex risk decision
```

PowerFlex evaluates:

1. Is the event still valid and in the correct zone?
2. Is the utilisation price above the business threshold?
3. Is the BESS available?
4. Can the requested power and duration fit within BESS limits?
5. Will the battery remain above the reserve requirement?
6. Does the event overlap a depot blackout window?
7. Is the risk low enough for automatic dispatch?
8. If risk is high, should it go to human review?

The final decision is one of:

- `dispatch_now`: execute immediately.
- `schedule_dispatch`: schedule a future battery action.
- `skip`: do not participate.
- `human_review`: do not auto-dispatch; ask an operator.

## Battery Action POST

When the agent approves participation, the workflow sends a battery control action to:

```text
POST https://ukpn-flex-api.onrender.com/ocpp/actions
```

This happens only for approved decisions:

- `dispatch_now`
- `schedule_dispatch`

It does not dispatch for:

- `skip`
- `human_review`

The implementation is in `src/action.ts`.

Example OpenCLAW/PowerFlex decision:

```json
{
  "action": "schedule_dispatch",
  "asset_id": "BESS-HAL-01",
  "power_kw": 60,
  "duration_minutes": 30,
  "risk_level": "low",
  "rationale": "BESS is available and stays above reserve."
}
```

The workflow converts that into an API payload:

```json
{
  "action_type": "schedule_battery_dispatch",
  "asset_id": "BESS-HAL-01",
  "power_kw": 60,
  "duration_minutes": 30,
  "reason": "Intraday generation_turn_up event: BESS is available and stays above reserve.",
  "event_id": "PowerShift - Halstead Intraday",
  "risk_level": "low"
}
```

Live POST is the default behavior:

```bash
ACTION_API_MODE=live
```

Use `ACTION_API_MODE=simulate` only for local testing when you explicitly do not want a real POST.

## Runtime Modes

### Real End-To-End Run

Terminal 1: start the private data API. This keeps the main workflow API-oriented while serving local JSON payloads for the demo.

```bash
npm run mock-private-api
```

Terminal 2: run the full real workflow with OpenCLAW reasoning, live battery POST, Telegram, CSV evidence, and HTML dashboard output.

```bash
TELEGRAM_ENABLED=true \
TELEGRAM_BOT_TOKEN="bot_token" \
TELEGRAM_CHAT_ID="bot_chat_id" \
npm run demo
```

Current demo command with Telegram configured:

```bash
TELEGRAM_ENABLED=true \
TELEGRAM_BOT_TOKEN="bot_token" \
TELEGRAM_CHAT_ID="bot_chat_id" \
npm run demo
```

For a faster test of the same real flow, use:

```bash
TELEGRAM_ENABLED=true \
TELEGRAM_BOT_TOKEN="bot_token" \
TELEGRAM_CHAT_ID="bot_chat_id" \
npm run demo:fast
```

Current fast demo command with Telegram configured:

```bash
TELEGRAM_ENABLED=true \
TELEGRAM_BOT_TOKEN="bot_token" \
TELEGRAM_CHAT_ID="bot_chat_id" \
npm run demo:fast
```

`ACTION_API_MODE=live` and `OPENCLAW_DRY_RUN=false` are the defaults.

### Local Non-Live Test

Use this only when you do not want live battery POST or Telegram sends:

```bash
ACTION_API_MODE=simulate \
TELEGRAM_ENABLED=false \
npm run demo:fast
```

Production cadence, one run per minute:

```bash
npm run demo
```

## API Configuration

Public flex events:

```bash
FLEX_EVENTS_URL=https://ukpn-flex-api.onrender.com/catalog/datasets/ukpn-flexibility-dispatches/records
```

Private data APIs:

These APIs provide the company-specific context that the public flex event API does not contain.
PowerFlex needs them to check business policy, depot constraints, and battery capability before deciding whether to dispatch.
In production these point to real private services; locally `mock-private-api` serves the JSON payloads from `data/spark-files` through the same API shape.

```bash
PRIVATE_COMPANY_PROFILE_URL=http://localhost:8787/company-profile
PRIVATE_DEPOT_OPS_URL=http://localhost:8787/depot-ops
PRIVATE_BESS_ASSETS_URL=http://localhost:8787/bess-assets
```

Battery action API:

```bash
BATTERY_ACTION_URL=https://ukpn-flex-api.onrender.com/ocpp/actions
```

## PowerFlex Agent Integration

PowerFlex calls the OpenCLAW harness through the CLI:

```bash
openclaw agent \
  --agent main \
  --session-key flex-demo \
  --thinking high \
  --message "..." \
  --json
```

On DGX Spark, this should work the same way if the local OpenCLAW harness routes `openclaw agent` to Nemotron and returns JSON in the same CLI shape.

## File Guide

`AGENTS.md`

Defines the agent decision workflow: inspect flex event, inspect private data, evaluate risk, decide, explain, and produce settlement notes.

`IDENTITY.md`

Defines the demo identity and preferred asset, `BESS-HAL-01`.

`src/main.ts`

Main loop. Runs five iterations, calls the APIs, asks the PowerFlex agent, submits battery action, writes evidence, and sends Telegram.

`src/config.ts`

Central env configuration for API URLs, agent options, Telegram, demo interval, and battery action mode.

`src/data.ts`

Fetches public flex events and private data APIs. Also uses replay flex events only when the public API does not provide enough demo events.

`src/openclaw.ts`

Builds the real decision prompt, calls `openclaw agent`, parses the harness response, and validates the returned decision JSON.

`src/decision.ts`

Contains only the decision schema used to validate OpenCLAW output. It does not make decisions.

`src/action.ts`

Builds and sends the battery action POST. Uses `ACTION_API_MODE=live` by default.

`src/evidence.ts`

Writes the settlement CSV and generates the HTML dashboard.

`src/telegram.ts`

Formats and sends Telegram messages. Includes retry and curl fallback for transient Telegram network failures.

`src/mock-private-api.ts`

Local demo server that exposes private company, depot, and BESS JSON files as APIs.

`data/spark-files/*.json`

Sample private data payloads used by the local mock private API. The main workflow still reads them through HTTP, not directly from disk.

`data/replay-flex-events.json`

Replay flex events used only to ensure the demo has five useful cases.

`skills/settlement-evidence/SKILL.md`

Skill description for how settlement evidence should be created and summarized.

`tests/*.test.ts`

Unit tests for decision behavior and Telegram message formatting.

## Outputs

Generated outputs are written outside the project folder:

```text
../../outputs/powerflex-settlement-evidence.csv
../../outputs/powerflex-flex-dashboard.html
```

`powerflex-settlement-evidence.csv`

Audit log for every run. It includes event details, decision, asset, power, duration, risk, confidence, human-review status, action mode, action status, and rationale.

`powerflex-flex-dashboard.html`

Small dashboard showing the latest run: decision, risk, asset, event, control action, rationale, and settlement notes.

Telegram output

One message per run, formatted with event, decision, power, risk, rationale, battery action status, and evidence notes.

## Verification

```bash
npm run typecheck
npm test
```
