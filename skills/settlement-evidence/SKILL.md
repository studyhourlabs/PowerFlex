# Settlement Evidence Skill

Use this skill whenever the PowerFlex workflow needs settlement evidence for a dispatch decision.

Inputs:

- public flexibility event
- private company/depot/BESS data
- agent decision
- battery action result

Outputs:

- CSV row for audit and settlement evidence
- lightweight HTML dashboard for the latest run
- Telegram-ready settlement summary

Evidence rules:

1. Include event id, product, zone, dispatch type, start/end time, requested MW/MWh, and price.
2. Include selected asset id, action type, power kW, duration, risk level, and decision rationale.
3. Include whether the battery action was simulated or submitted live.
4. Include human-in-the-loop status for medium/high risk decisions.
5. Keep generated evidence deterministic and timestamped.
