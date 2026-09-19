function norm(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, ' '); }
const OPEN = new Set(['NOT_CHECKED','UNRESOLVED','CONFLICTING']);
const DIMENSIONS = ['TITLE','LEGAL','FINANCIAL','PLANNING','INFRASTRUCTURE','WATER','DOCUMENT','PROJECT'];

function buildWatchtower({ property, evidence, assessment, propertyIntelligence }) {
  const rows = [...(evidence || [])].sort((a,b) => new Date(a.observedAt || a.createdAt || 0) - new Date(b.observedAt || b.createdAt || 0));
  const changes = [];
  const latestByDimension = {};
  const historyByDimension = {};
  for (const d of DIMENSIONS) historyByDimension[d] = [];
  for (const row of rows) {
    const d = String(row.dimension || 'UNKNOWN').toUpperCase();
    (historyByDimension[d] ||= []).push(row);
    const previous = latestByDimension[d];
    if (previous) {
      const changed = norm(previous.observation) !== norm(row.observation) || previous.status !== row.status || previous.confidence !== row.confidence || (previous.sourceKey || previous.source) !== (row.sourceKey || row.source);
      if (changed) changes.push({ dimension:d, from:{evidenceId:previous.id, observation:previous.observation, status:previous.status, confidence:previous.confidence, source:previous.sourceKey || previous.source}, to:{evidenceId:row.id, observation:row.observation, status:row.status, confidence:row.confidence, source:row.sourceKey || row.source}, observedAt:row.observedAt || row.createdAt || null, impact: OPEN.has(row.status) ? 'REVIEW_REQUIRED' : 'REASSESS_DIMENSION' });
    }
    latestByDimension[d] = row;
  }
  const stale = (propertyIntelligence?.verificationGaps || []).filter(x => x.reason === 'STALE_EVIDENCE').map(x => ({dimension:x.dimension, action:x.action}));
  const open = Object.entries(assessment?.dimensions || {}).filter(([,v]) => OPEN.has(v.status)).map(([dimension,v]) => ({dimension,status:v.status,evidenceCount:v.evidenceCount,confidence:v.confidence}));
  const sourceChanges = changes.filter(x => x.from.source !== x.to.source);
  const alerts = [];
  for (const c of changes.slice(-20).reverse()) alerts.push({type:'EVIDENCE_CHANGE', severity:c.impact === 'REVIEW_REQUIRED' ? 'HIGH' : 'MEDIUM', dimension:c.dimension, message:`Evidence state changed in ${c.dimension}. Re-check the affected decision path.`, evidenceIds:[c.from.evidenceId,c.to.evidenceId], observedAt:c.observedAt});
  for (const x of open) alerts.push({type:'OPEN_EVIDENCE', severity:x.status === 'CONFLICTING' ? 'HIGH' : 'MEDIUM', dimension:x.dimension, message:`${x.dimension} remains ${x.status}. Do not treat missing or unresolved evidence as a negative finding.`});
  for (const x of stale) alerts.push({type:'STALE_EVIDENCE', severity:'MEDIUM', dimension:x.dimension, message:x.action});
  const nextActions = [...new Set([...open.map(x=>x.dimension), ...stale.map(x=>x.dimension)])].slice(0,8).map(d=>({dimension:d,action:`Verify the latest authoritative record for ${d} and record the source reference, observation time, status and confidence.`}));
  return { generatedAt:new Date().toISOString(), propertyId:property.id, propertyReference:property.propertyId || null, currentDecision:assessment?.decision || 'NOT_CHECKED', summary:{evidenceCount:rows.length, detectedChanges:changes.length, sourceChanges:sourceChanges.length, openDimensions:open.length, staleDimensions:stale.length}, changes, alerts:alerts.slice(0,30), latestByDimension:Object.fromEntries(Object.entries(latestByDimension).map(([d,r])=>[d,{evidenceId:r.id,status:r.status,confidence:r.confidence,source:r.sourceKey||r.source,observedAt:r.observedAt||r.createdAt||null}])), nextVerificationActions:nextActions, principles:['Change detection compares stored observations; it does not prove that an external source changed.','Alerts are review signals, not legal conclusions or future predictions.','NO EVIDENCE ≠ NEGATIVE EVIDENCE.'] };
}
module.exports={buildWatchtower};
