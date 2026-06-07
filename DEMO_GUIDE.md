# PowerFlex Hackathon Demo Guide

## One-Line Pitch

PowerFlex uses the OpenCLAW agent harness to turn public grid flexibility events into safe, auditable depot battery actions.

## Core Flow

```text
Public Flex API
+ Private Depot/BESS APIs
-> OpenCLAW Agent
-> Decision JSON
-> Battery Action POST
-> Telegram + Evidence Report
```

## What Each Step Means

### 1. Public Flex API

PowerFlex polls a public flexibility event API.

This tells us the market opportunity:

- where the event is
- when it starts and ends
- requested power and energy
- dispatch type
- utilisation price

This answers: **what is the grid asking for?**

### 2. Private Depot/BESS APIs

PowerFlex also calls private APIs for company and asset context.

These APIs provide:

- company policy
- minimum acceptable price
- depot operating constraints
- blackout windows
- BESS state of charge
- BESS max charge/discharge limits
- reserve requirements

This answers: **can our site safely participate?**

### 3. OpenCLAW Agent

The TypeScript workflow sends the public event, private data, `AGENTS.md`, and `IDENTITY.md` into OpenCLAW.

OpenCLAW is the reasoning harness. On DGX Spark, the same harness can route to the local vLLM Nemotron model.

This answers: **what should we do, and why?**

### 4. Decision JSON

OpenCLAW must return strict decision JSON:

```json
{
  "action": "schedule_dispatch",
  "asset_id": "BESS-HAL-01",
  "power_kw": 60,
  "duration_minutes": 30,
  "risk_level": "low",
  "confidence": "high",
  "rationale": "BESS is available and the event is within guardrails.",
  "human_review_required": false,
  "settlement_evidence_notes": "Store event id, command response, and timestamp."
}
```

Possible decisions:

- `dispatch_now`
- `schedule_dispatch`
- `skip`
- `human_review`

### 5. Battery Action POST

If the decision is approved, PowerFlex sends a live battery action POST.

Approved actions:

- `dispatch_now`
- `schedule_dispatch`

Non-dispatch actions:

- `skip`
- `human_review`

This answers: **should we control the battery now or schedule it?**

### 6. Telegram + Evidence Report

PowerFlex sends the decision to Telegram and writes settlement evidence.

Outputs:

- Telegram decision message
- `outputs/powerflex-settlement-evidence.csv`
- `outputs/powerflex-flex-dashboard.html`

This answers: **what happened, and how do we audit it?**

## Business Logic Summary

PowerFlex combines public grid opportunity with private operational constraints.

The agent checks:

- event location
- price threshold
- battery availability
- state of charge
- reserve requirement
- requested kW
- duration
- blackout windows
- human-review guardrails

Low-risk, high-value events are dispatched or scheduled. Risky events go to human review. Invalid or uneconomic events are skipped.

## Demo Commands

Terminal 1:

```bash
cd /Users/jimmy/code/LondonHackathon
npm run mock-private-api
```

Terminal 2:

```bash
cd /Users/jimmy/code/LondonHackathon

TELEGRAM_ENABLED=true \
TELEGRAM_BOT_TOKEN="bot_token" \
TELEGRAM_CHAT_ID="bot_chat_id" \
npm run demo:fast
```

## What To Show In The Video

1. `AGENTS.md`: agent workflow and risk logic.
2. `IDENTITY.md`: agent identity and target asset.
3. `skills/settlement-evidence/SKILL.md`: evidence requirements.
4. `src/openclaw.ts`: OpenCLAW harness call and decision prompt.
5. `src/data.ts`: public and private API consumption.
6. `src/action.ts`: battery action POST.
7. Telegram: live decision messages.
8. `outputs/powerflex-settlement-evidence.csv`: audit trail.
9. `outputs/powerflex-flex-dashboard.html`: operator-facing report.

## Closing Message

PowerFlex demonstrates an agentic operations loop:

```text
observe -> reason -> decide -> act -> notify -> audit
```

OpenCLAW provides the reasoning harness. APIs provide real operational context. The workflow makes the system repeatable, auditable, and connected to action.
