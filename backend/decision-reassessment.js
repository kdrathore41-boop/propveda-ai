const OPEN = new Set(['NOT_CHECKED','UNRESOLVED','CONFLICTING']);
const DIMENSIONS = ['TITLE','LEGAL','FINANCIAL','PLANNING','INFRASTRUCTURE','WATER','DOCUMENT','PROJECT'];
const WEIGHTS = { TITLE:10, LEGAL:9, DOCUMENT:8, PLANNING:7, FINANCIAL:6, PROJECT:5, INFRASTRUCTURE:4, WATER:3 };

function statusOf(rows) {
  if (!rows.length) return 'NOT_CHECKED';
  const s = new Set(rows.map(x => x.status || 'NOT_CHECKED'));
  if (s.has('CONFLICTING')) return 'CONFLICTING';
  if (s.has('UNRESOLVED')) return 'UNRESOLVED';
  if (s.has('PARTIALLY_VERIFIED')) return 'PARTIALLY_VERIFIED';
  if (s.has('VERIFIED')) return 'VERIFIED';
  return 'NOT_CHECKED';
}
function reassessDecision(rows) {
  const states = Object.fromEntries(DIMENSIONS.map(d => [d, statusOf(rows.filter(e => String(e.dimension||'').toUpperCase() === d))]));
  const open = DIMENSIONS.filter(d => OPEN.has(states[d]));
  const critical = DIMENSIONS.filter(d => ['TITLE','LEGAL','DOCUMENT'].includes(d) && OPEN.has(states[d]));
  const oldStyle = open.length === 0 ? 'PROCEED' : open.length <= 2 ? 'PROCEED_AFTER_VERIFICATION' : open.length <= 4 ? 'REVIEW_NEGOTIATE' : 'HOLD';
  const simulated = critical.some(d => states[d] === 'CONFLICTING') ? 'ESCALATE' : oldStyle;
  return { states, open, critical, decision: simulated };
}
function buildDecisionReassessment({property,evidence,assessment,watchtower,scenarioIntelligence}) {
  const rows = evidence || [];
  const current = reassessDecision(rows);
  const prior = assessment?.decision || 'NOT_CHECKED';
  const changedDimensions = (watchtower?.changes || []).map(x => x.dimension).filter((v,i,a)=>a.indexOf(v)===i);
  const affected = [...new Set([...changedDimensions, ...current.open])].sort((a,b)=>(WEIGHTS[b]||0)-(WEIGHTS[a]||0));
  const triggers = [];
  for (const d of changedDimensions) triggers.push({type:'EVIDENCE_CHANGE',dimension:d,impact:'REASSESS',message:`Stored evidence changed for ${d}; re-evaluate dependent decision paths.`});
  for (const d of current.critical) triggers.push({type:'CRITICAL_GAP',dimension:d,impact:'HIGH',message:`${d} remains open or conflicting and should be resolved before relying on the current decision.`});
  const actions = affected.slice(0,8).map((d,i)=>({priority:i<2?'HIGH':i<5?'MEDIUM':'LOW',dimension:d,action:`Re-check ${d} using the latest authoritative evidence, then refresh the assessment and record source, observation time, status and confidence.`}));
  const decisionChanged = prior !== current.decision;
  return {
    generatedAt:new Date().toISOString(), propertyId:property.id, propertyReference:property.propertyId||null,
    currentDecision:prior, reassessedDecision:current.decision, decisionChanged,
    triggerSummary:{changedDimensions:changedDimensions.length, openDimensions:current.open.length, criticalOpenDimensions:current.critical.length, totalTriggers:triggers.length},
    triggers:triggers.slice(0,30),
    affectedDecisionPaths:affected.slice(0,12),
    dimensionStates:current.states,
    prioritizedActions:actions,
    whatIf: current.open.slice(0,8).map(d=>({dimension:d,ifStatus:'VERIFIED',effect:'This would remove that dimension from the open-evidence set; the final decision must still be recomputed against all dimensions.',deterministic:true})),
    scenarioContext:scenarioIntelligence ? {opportunitySignals:(scenarioIntelligence.opportunitySignals||[]).length,riskScenarios:(scenarioIntelligence.riskScenarios||[]).length} : null,
    principles:['Reassessment is triggered by stored evidence state, not prediction.','A reassessment is not legal clearance, valuation advice, or a guarantee of outcome.','NO EVIDENCE ≠ NEGATIVE EVIDENCE.']
  };
}
module.exports={buildDecisionReassessment};
