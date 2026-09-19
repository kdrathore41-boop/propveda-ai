const crypto = require('crypto');

const PRIORITY_WEIGHT = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const VALID_STATUS = new Set(['OPEN','ACKNOWLEDGED','COMPLETED','DISMISSED']);

function actionId(propertyId, type, dimension) {
  return crypto.createHash('sha1').update(`${propertyId}|${type}|${dimension}`).digest('hex').slice(0, 16);
}

function buildActionCandidates({ property, watchtower, decisionReassessment }) {
  const propertyId = property.id;
  const candidates = [];
  const seen = new Set();
  const add = (type, dimension, priority, title, reason, action) => {
    const key = `${type}|${dimension}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      id: actionId(propertyId, type, dimension), propertyId, type, dimension,
      priority, priorityWeight: PRIORITY_WEIGHT[priority] || 1, title, reason, action,
      source: 'DECISION_REASSESSMENT', generatedAt: new Date().toISOString()
    });
  };

  for (const t of (decisionReassessment?.triggers || [])) {
    if (t.type === 'CRITICAL_GAP') {
      add('VERIFY_CRITICAL', t.dimension, 'CRITICAL', `Verify ${t.dimension}`, t.message,
        `Verify ${t.dimension} from the latest authoritative source and record the evidence observation.`);
    } else if (t.type === 'EVIDENCE_CHANGE') {
      add('REASSESS_CHANGE', t.dimension, 'HIGH', `Reassess ${t.dimension}`, t.message,
        `Review the changed evidence, confirm source/date/status/confidence, then refresh the decision path.`);
    }
  }
  for (const a of (decisionReassessment?.prioritizedActions || [])) {
    add('VERIFY_GAP', a.dimension, a.priority, `Verification: ${a.dimension}`, a.action, a.action);
  }
  for (const a of (watchtower?.nextVerificationActions || [])) {
    add('WATCHTOWER_ACTION', a.dimension, a.priority || 'MEDIUM', `Watchtower: ${a.dimension}`,
      'Evidence Watchtower identified a verification need.', a.action);
  }

  return candidates.sort((a,b) => (b.priorityWeight-a.priorityWeight) || a.dimension.localeCompare(b.dimension));
}

function reconcileActions(existing, candidates) {
  const now = new Date().toISOString();
  const byId = new Map((existing || []).map(x => [x.id, x]));
  for (const c of candidates) {
    const old = byId.get(c.id);
    byId.set(c.id, old ? { ...c, ...old, priorityWeight: c.priorityWeight, lastSeenAt: now } : { ...c, status:'OPEN', createdAt:now, lastSeenAt:now });
  }
  return [...byId.values()];
}

function summarize(actions) {
  const counts = { OPEN:0, ACKNOWLEDGED:0, COMPLETED:0, DISMISSED:0 };
  for (const a of actions) counts[a.status] = (counts[a.status] || 0) + 1;
  return { total: actions.length, ...counts };
}

function buildActionOrchestration({ property, watchtower, decisionReassessment, existingActions=[] }) {
  const candidates = buildActionCandidates({ property, watchtower, decisionReassessment });
  const actions = reconcileActions(existingActions, candidates);
  const active = actions.filter(a => ['OPEN','ACKNOWLEDGED'].includes(a.status)).sort((a,b) => (b.priorityWeight-a.priorityWeight) || a.dimension.localeCompare(b.dimension));
  return {
    generatedAt: new Date().toISOString(), propertyId: property.id,
    actions: active.slice(0, 20), summary: summarize(actions),
    candidateCount: candidates.length,
    principles: [
      'Actions are derived from stored evidence and reassessment signals, not predictions.',
      'An action is a workflow prompt, not legal clearance or professional advice.',
      'NO EVIDENCE ≠ NEGATIVE EVIDENCE.'
    ],
    allActions: actions
  };
}

module.exports = { buildActionOrchestration };
