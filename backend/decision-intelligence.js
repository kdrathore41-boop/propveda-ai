const DIMENSIONS = ['TITLE','LEGAL','FINANCIAL','PLANNING','INFRASTRUCTURE','WATER','DOCUMENT','PROJECT'];
const PRIORITY_ORDER = ['TITLE','LEGAL','DOCUMENT','PLANNING','FINANCIAL','PROJECT','INFRASTRUCTURE','WATER'];

function statusOf(items) {
  if (!items.length) return 'NOT_CHECKED';
  const s = new Set(items.map(x => x.status || 'NOT_CHECKED'));
  if (s.has('CONFLICTING')) return 'CONFLICTING';
  if (s.has('UNRESOLVED')) return 'UNRESOLVED';
  if (s.has('NOT_CHECKED')) return 'NOT_CHECKED';
  if (s.has('PARTIALLY_VERIFIED')) return 'PARTIALLY_VERIFIED';
  return 'VERIFIED';
}

function confidenceOf(items) {
  if (items.some(x => x.confidence === 'HIGH')) return 'HIGH';
  if (items.some(x => x.confidence === 'MEDIUM')) return 'MEDIUM';
  if (items.some(x => x.confidence === 'LOW')) return 'LOW';
  return 'UNKNOWN';
}

function decisionIntelligence(propertyId, property, evidence, assessment, evidenceIntel) {
  const byDimension = {};
  for (const d of DIMENSIONS) byDimension[d] = evidence.filter(e => String(e.dimension || '').toUpperCase() === d);

  const unresolved = [];
  const verified = [];
  const stale = [];
  const unknown = [];
  for (const d of DIMENSIONS) {
    const items = byDimension[d];
    const status = statusOf(items);
    const confidence = confidenceOf(items);
    const freshness = (evidenceIntel.freshness || []).filter(x => items.some(e => e.id === x.evidenceId));
    if (['CONFLICTING','UNRESOLVED'].includes(status)) unresolved.push({ dimension:d, status, confidence, reason:'Evidence requires resolution before relying on this dimension.', evidenceIds:items.map(x=>x.id) });
    else if (status === 'NOT_CHECKED') unknown.push({ dimension:d, status, confidence, reason:'No evidence is currently recorded for this dimension.' });
    else if (status === 'VERIFIED') verified.push({ dimension:d, status, confidence, evidenceIds:items.map(x=>x.id) });
    if (freshness.some(x => x.label === 'STALE')) stale.push({ dimension:d, reason:'At least one evidence record is stale.', evidenceIds:items.filter((_,i)=>freshness[i]?.label==='STALE').map(x=>x.id) });
  }

  const priorities = [];
  const add = (dimension, type, action, reason, evidenceIds=[]) => priorities.push({ priority: priorities.length + 1, dimension, type, action, reason, evidenceIds });
  for (const d of PRIORITY_ORDER) {
    const u = unresolved.find(x=>x.dimension===d); const n = unknown.find(x=>x.dimension===d); const s = stale.find(x=>x.dimension===d);
    if (u) add(d,'RESOLVE_CONFLICT_OR_UNRESOLVED','Resolve and re-verify the relevant evidence before decision use.',u.reason,u.evidenceIds);
    else if (n) add(d,'COLLECT_EVIDENCE','Collect authoritative evidence and record its source/reference before relying on this dimension.',n.reason);
    else if (s) add(d,'REFRESH_EVIDENCE','Refresh the relevant source record and re-check verification status.',s.reason,s.evidenceIds);
  }

  let action = 'Decision can be revisited as evidence changes.';
  if (assessment.decision === 'HOLD') action = 'Pause reliance on the current property assessment until the unresolved verification gaps are addressed.';
  else if (assessment.decision === 'REVIEW_NEGOTIATE') action = 'Review the unresolved dimensions and consider transaction terms only after the key evidence gaps are addressed.';
  else if (assessment.decision === 'PROCEED_AFTER_VERIFICATION') action = 'Proceed only after the identified verification gaps are resolved or professionally reviewed.';
  else if (assessment.decision === 'PROCEED') action = 'Continue with normal transaction due diligence; keep evidence and documents current.';

  const conflictCount = evidenceIntel.conflicts?.conflictCount || 0;
  return {
    propertyId,
    generatedAt: new Date().toISOString(),
    decision: assessment.decision,
    decisionBasis: {
      unresolvedDimensions: unresolved.length,
      unknownDimensions: unknown.length,
      staleDimensions: stale.length,
      verifiedDimensions: verified.length,
      conflictCount,
      principle: 'The decision state is derived from recorded evidence and verification state; it is not a guarantee or valuation.'
    },
    explanation: action,
    whatWeKnow: verified,
    whatNeedsVerification: [...unresolved, ...unknown, ...stale.filter(x=>!unresolved.some(u=>u.dimension===x.dimension) && !unknown.some(n=>n.dimension===x.dimension))],
    prioritizedActions: priorities.slice(0, 8),
    buyerQuestions: priorities.slice(0, 8).map(x => ({ dimension:x.dimension, question:`What authoritative evidence supports the ${x.dimension.toLowerCase()} position, and is it current?` })),
    confidence: verified.length === DIMENSIONS.length && conflictCount === 0 ? 'HIGH' : verified.length >= 4 && unresolved.length === 0 ? 'MEDIUM' : 'LOW_OR_UNKNOWN'
  };
}

module.exports = { decisionIntelligence, DIMENSIONS };
