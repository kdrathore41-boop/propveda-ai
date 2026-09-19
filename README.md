# PropVeda AI MVP v1.4.1

PropVeda AI is an evidence-first **Property Intelligence Platform**. It is designed to move beyond listings by connecting property identity, evidence, verification, risk/decision context and buyer requirements in one workflow.

## Core architecture

**Property Identity → Evidence Graph → Verification → Property Intelligence → Risk/Decision → Report**

**Buyer Input → Buyer Intelligence → Explainable Matching → Discovery → Compare → AI Decision Support**

## v1.4.1 capabilities
- Property Intelligence and evidence coverage.
- Verification workspace with explicit result states and audit events.
- Evidence snapshots, provenance and timeline layers.
- Buyer profile storage with budget, location, type, purpose, size, priorities, deal-breakers and risk preference.
- Natural-language buyer discovery for Hindi/Hinglish/English queries.
- Explainable matching using location, type, budget, size, purpose, preferences and evidence availability.
- Controlled discovery sorting: relevant, price ascending, size, recently updated and evidence availability.
- Buyer activity signals: SEARCH, VIEW, SAVE, COMPARE, ENQUIRY and CONSULTATION. Activity is a signal, not proof of purchase intent.
- Side-by-side property comparison using recorded facts and evidence coverage; it does not select a winner.

## Evidence rules
- **NO EVIDENCE ≠ NEGATIVE EVIDENCE.**
- Missing, stale, unresolved or conflicting evidence is surfaced as a verification gap.
- Confidence describes the available evidence state; it is not a guarantee of title, value, safety or future returns.
- GIS-derived distances are contextual intelligence, not authoritative ownership, boundary or zoning evidence.
- Government/public-source connectors remain authorized/manual scaffolds unless a technically verified integration is actually implemented.
- Provider-submitted information is not automatically verified.

## API highlights
- `GET /api/health`
- `GET /api/readiness`
- `GET /api/properties/:id/intelligence`
- `GET /api/properties/:id/verification-workspace`
- `GET /api/buyers/:buyerId`
- `POST /api/buyers`
- `POST /api/buyers/query`
- `POST /api/buyers/:buyerId/activity`
- `GET /api/buyers/:buyerId/activity`
- `GET /api/discovery?q=...&sort=relevant`
- `POST /api/matching/explain`
- `POST /api/compare`

## Runtime
Node.js 18+ is required.

```bash
npm install
npm start
```

The MVP uses JSON storage for portability. Before production customer use, migrate persistence to a transactional database and add authentication/authorization, rate limiting, backups, secret management, monitoring and appropriate file-upload controls.

## Verification status
The package has passed the included **30/30 static smoke checks**. Dependency installation/live server execution was not completed in the packaging environment because `npm install` timed out; therefore deployment-environment runtime verification remains a deployment step, not a claimed local verification.
