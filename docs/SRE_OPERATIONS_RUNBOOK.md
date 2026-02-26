# SRE Operations Runbook (Enterprise)

## Ownership model
- **Primary on-call:** Engineering Lead
- **Secondary on-call:** Backend/SRE engineer
- **Escalation:** CTO/Founder within 30 minutes for Sev-1

## Incident severities and response targets
- **Sev-1 (outage/data loss/security incident):** ack <= 5 min, mitigation <= 30 min
- **Sev-2 (major degradation):** ack <= 15 min, mitigation <= 2 h
- **Sev-3 (minor degradation):** ack <= 4 h, mitigation <= 1 business day

## Alert channels
- Sentry alerts -> Pager channel (Slack/Email)
- Uptime monitor alerts -> Pager channel
- DB backup smoke failures -> Ops email + issue tracker

## Required weekly evidence
1. CI green for:
   - Test/Build
   - Real DB parity
2. Backup restore smoke run green (`backup-restore-smoke.yml`)
3. Incident review log updated (even if "no incidents")

## Monthly evidence
1. Secret rotation audit (JWT/cookie/encryption keys policy validation)
2. Access review (production server/database accounts)
3. DR drill note (restore objective and elapsed time)

## Audit storage
- Store links to workflow runs + screenshots + incident timeline in:
  - `ops/audit/YYYY-MM/README.md` (private internal repo/wiki)

## Release gate (operational)
- Do not release if any of these are missing:
  - Latest weekly backup-restore smoke success
  - Latest real DB parity success
  - Open Sev-1 unresolved
