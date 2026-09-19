# PropVeda AI — Deployment Readiness v1.4.1

## Required environment
- Node.js 18+
- `npm install`
- `npm start`
- `PORT` (platform-provided value is preferred)
- `CORS_ORIGIN` set to the exact production frontend origin rather than `*` for production use

## Health endpoints
- `/api/health`
- `/api/readiness`
- `/api/sources/health`
- `/api/connectors`

## Buyer / discovery endpoints
- `/api/buyers`
- `/api/buyers/query`
- `/api/buyers/:buyerId/activity`
- `/api/discovery`
- `/api/matching/explain`
- `/api/compare`

## Property Intelligence
- `/api/properties/:id/intelligence`
- `/api/properties/:id/evidence/intelligence`
- `/api/properties/:id/evidence/conflicts`
- `/api/properties/:id/verification-workspace`
- `/api/properties/:id/report`

## Deployment boundary
Registered government/public sources are connector scaffolds unless an authorized, technically verified integration is added. Do not label manually collected, provider-derived or unverified information as authoritative.

The JSON data layer is suitable for an MVP/demo workflow, not concurrent production workloads. Before production customer use, migrate persistence to a transactional database, implement authentication/authorization, rate limiting, backups, audit controls and monitoring.

## Current verification note
Static source checks: **30/30 PASS**. Live runtime was not verified in the packaging environment because dependency installation timed out. After deployment, confirm `/api/health`, `/api/readiness`, the frontend, buyer discovery, and a sample property intelligence route from the deployed service.
