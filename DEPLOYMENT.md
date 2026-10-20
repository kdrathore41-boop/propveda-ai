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

## Public buyer lead intake and notifications
- Public form: /buyer-intake.html
- Admin inbox: /lead-inbox.html
- POST /api/public/buyer-leads validates contact and buying requirements, requires explicit callback consent, stores the CRM contact + buyer profile + lead, and records a CRM/audit event.
- GET /api/lead-inbox and PATCH /api/lead-inbox/:leadId require Authorization: Bearer <LEAD_ADMIN_TOKEN>. Set LEAD_ADMIN_TOKEN in Render before using the inbox. Do not put this token in frontend source or send it to buyers.
- CRM contact lists, buyer profile lists/details, buyer activity, consultations and CRM event lists are also protected by LEAD_ADMIN_TOKEN because they can contain personal information. Public lead submissions remain available without the admin token but require explicit callback consent.
- GET /api/lead-capture/status reports whether WhatsApp and the protected inbox are configured without revealing credentials.
- WhatsApp Cloud API delivery requires WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ADMIN_PHONE, WHATSAPP_API_VERSION, WHATSAPP_TEMPLATE_NAME, and optionally WHATSAPP_TEMPLATE_LANGUAGE. Configure the currently supported Graph API version in Meta.
- Create/approve a WhatsApp message template whose body has seven text placeholders, in this order: buyer name, mobile, max budget, purpose, location, buying timeline, site-visit preference. The server sends a template message to the configured admin recipient. Never commit access tokens to GitHub.
- If WhatsApp variables are missing, the lead is still saved in the CRM inbox and its notification state remains NOT_CONFIGURED; if Meta rejects or times out, the lead is saved and notification state is marked for retry. Do not treat a saved lead as proof the WhatsApp message was delivered.
- The public form includes consent, basic validation, a honeypot and an in-memory rate limit. JSON-file storage is an MVP limitation: use a persistent disk/transactional database and stronger production controls before large-scale advertising. No automatic message is sent to the buyer.
