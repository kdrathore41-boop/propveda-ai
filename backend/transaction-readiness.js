const DIMENSIONS = ['TITLE','LEGAL','FINANCIAL','PLANNING','INFRASTRUCTURE','WATER','DOCUMENT','PROJECT'];

function buildTransactionReadiness({ property, evidence, documents, gis, buyerAssistant, decisionIntelligence }) {
  const evidenceByDimension = Object.fromEntries(DIMENSIONS.map(d => [d, evidence.filter(e => String(e.dimension || '').toUpperCase() === d)]));
  const unresolved = new Set((decisionIntelligence?.whatNeedsVerification || []).map(x => x.dimension));
  const documentFlags = documents.flatMap(d => (d.clauses || []).map(c => ({ documentId:d.id, document:d.name, code:c.code, label:c.label, action:c.action })));
  const gisWithSources = gis.filter(g => g.source || g.reference);
  const readiness = [];
  for (const d of DIMENSIONS) {
    const items = evidenceByDimension[d];
    const verified = items.filter(e => e.status === 'VERIFIED').length;
    const unresolvedCount = items.filter(e => ['UNRESOLVED','CONFLICTING','NOT_CHECKED'].includes(e.status)).length;
    let state = 'NOT_CHECKED';
    if (unresolved.has(d) || unresolvedCount) state = 'REQUIRES_VERIFICATION';
    else if (verified) state = 'SUPPORTED';
    readiness.push({ dimension:d, state, evidenceCount:items.length, verifiedCount:verified, unresolvedCount, evidenceIds:items.map(e=>e.id) });
  }
  if (documentFlags.length) readiness.find(x=>x.dimension==='DOCUMENT').state = 'REVIEW_REQUIRED';
  const blockers = readiness.filter(x => ['REQUIRES_VERIFICATION','REVIEW_REQUIRED'].includes(x.state)).map(x => ({ dimension:x.dimension, reason:x.state === 'REVIEW_REQUIRED' ? 'Document clause(s) require review.' : 'Evidence is unresolved, conflicting, stale, or not checked.', action:'Resolve the identified item before treating this dimension as decision-ready.' }));
  const nextActions = [...(buyerAssistant?.prioritizedActions || []).map(x => ({ source:'BUYER_CONTEXT', ...x })), ...documentFlags.slice(0,5).map(x => ({ source:'DOCUMENT', priority:99, dimension:'DOCUMENT', action:x.action, reason:`Clause flag: ${x.label}`, documentId:x.documentId }))];
  const unique = [];
  const seen = new Set();
  for (const a of nextActions) { const k = `${a.dimension}|${a.action}`; if (!seen.has(k)) { seen.add(k); unique.push(a); } }
  unique.forEach((x,i)=>x.priority=i+1);
  const gisCoverage = gis.length ? { count:gis.length, sourcedCount:gisWithSources.length, derivedDistanceCount:gis.filter(g=>g.distanceKm != null).length } : { count:0, sourcedCount:0, derivedDistanceCount:0 };
  return {
    propertyId: property.id,
    propertyReference: property.propertyId,
    generatedAt: new Date().toISOString(),
    buyerProfile: buyerAssistant?.buyerProfile || null,
    currentDecisionState: decisionIntelligence?.decision || 'REVIEW_NEGOTIATE',
    readiness: { dimensions: readiness, supportedDimensions: readiness.filter(x=>x.state==='SUPPORTED').length, totalDimensions:DIMENSIONS.length, blockerCount:blockers.length },
    blockers,
    documentReview: { documentCount:documents.length, clauseFlagCount:documentFlags.length, flags:documentFlags.slice(0,20) },
    gisContext: gisCoverage,
    nextActions: unique.slice(0,12),
    principle: 'Transaction readiness is an evidence workflow state, not a legal clearance, valuation, safety certification, or transaction guarantee.'
  };
}

module.exports = { buildTransactionReadiness };
