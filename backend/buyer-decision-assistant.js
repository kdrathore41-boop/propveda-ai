const DIMENSIONS = ['TITLE','LEGAL','FINANCIAL','PLANNING','INFRASTRUCTURE','WATER','DOCUMENT','PROJECT'];

function normalizePurpose(value) {
  const v = String(value || '').trim().toUpperCase();
  if (['RESIDENCE','INVESTMENT','COMMERCIAL','LAND'].includes(v)) return v;
  return 'GENERAL';
}

function normalizeRisk(value) {
  const v = String(value || '').trim().toUpperCase();
  if (['LOW','MEDIUM','HIGH'].includes(v)) return v;
  return 'UNKNOWN';
}

function buyerDecisionAssistant({ property, buyer, evidence, decisionIntelligence }) {
  const purpose = normalizePurpose(buyer?.purpose);
  const riskPreference = normalizeRisk(buyer?.riskPreference);
  const timeline = String(buyer?.timeline || '').trim();
  const financing = String(buyer?.financing || '').trim();
  const budget = buyer?.budget ?? null;

  const byDimension = Object.fromEntries(DIMENSIONS.map(d => [d, evidence.filter(e => String(e.dimension || '').toUpperCase() === d)]));
  const actions = [];
  const add = (dimension, priority, action, reason) => actions.push({ priority, dimension, action, reason });

  const unresolved = new Set((decisionIntelligence?.whatNeedsVerification || []).map(x => x.dimension));
  const priorities = decisionIntelligence?.prioritizedActions || [];
  for (const p of priorities.slice(0, 5)) add(p.dimension, p.priority, p.action, p.reason);

  if (purpose === 'RESIDENCE') {
    if (unresolved.has('TITLE') || !byDimension.TITLE.length) add('TITLE', 1, 'Verify title and ownership chain before making a residence purchase commitment.', 'Residence use increases the practical importance of clear, current ownership evidence.');
    if (unresolved.has('INFRASTRUCTURE') || !byDimension.INFRASTRUCTURE.length) add('INFRASTRUCTURE', 2, 'Verify access, utilities and relevant infrastructure evidence for the property.', 'These factors can materially affect day-to-day usability and should be checked for the specific property.');
    if (unresolved.has('WATER') || !byDimension.WATER.length) add('WATER', 3, 'Verify the available water-source evidence and its freshness.', 'Water availability is property- and locality-specific; missing evidence should remain unknown.');
  }
  if (purpose === 'INVESTMENT') {
    if (unresolved.has('PLANNING') || !byDimension.PLANNING.length) add('PLANNING', 1, 'Verify current land-use/planning evidence and applicable development controls.', 'Investment decisions can depend on planning constraints and permitted use.');
    if (unresolved.has('FINANCIAL') || !byDimension.FINANCIAL.length) add('FINANCIAL', 2, 'Verify transaction costs, encumbrance-related evidence and the financial assumptions being used.', 'A return calculation is only as reliable as its underlying assumptions and records.');
    if (unresolved.has('PROJECT') || !byDimension.PROJECT.length) add('PROJECT', 3, 'Verify project/developer-specific records relevant to the property.', 'Project-level evidence may affect execution and delivery considerations.');
  }
  if (purpose === 'COMMERCIAL') {
    if (unresolved.has('PLANNING') || !byDimension.PLANNING.length) add('PLANNING', 1, 'Verify permitted commercial use and applicable planning evidence.', 'Use permissions must be established from relevant records rather than inferred from location.');
    if (unresolved.has('INFRASTRUCTURE') || !byDimension.INFRASTRUCTURE.length) add('INFRASTRUCTURE', 2, 'Verify road access, utilities and relevant connectivity evidence.', 'Commercial usability can depend on access and service availability.');
  }
  if (purpose === 'LAND') {
    if (unresolved.has('TITLE') || !byDimension.TITLE.length) add('TITLE', 1, 'Verify title, khasra/parcel identity and ownership records.', 'Land transactions require property identity and ownership evidence to be tied to the same parcel.');
    if (unresolved.has('PLANNING') || !byDimension.PLANNING.length) add('PLANNING', 2, 'Verify land-use and planning records for the parcel.', 'Permitted use should be established from applicable planning records.');
  }

  const unique = [];
  const seen = new Set();
  for (const item of actions) { if (!seen.has(item.dimension)) { seen.add(item.dimension); unique.push(item); } }
  unique.sort((a,b) => a.priority - b.priority || a.dimension.localeCompare(b.dimension));
  unique.forEach((x,i) => x.priority = i + 1);

  const questions = [];
  const addQ = (dimension, question, why) => questions.push({ dimension, question, why });
  if (unique.some(x => x.dimension === 'TITLE')) addQ('TITLE', 'Which current authoritative record establishes the ownership and parcel identity?', 'Connect the evidence to the exact property before relying on title information.');
  if (unique.some(x => x.dimension === 'LEGAL')) addQ('LEGAL', 'Are there any unresolved legal records or disputes that still need verification?', 'Unresolved evidence should not be treated as a clean legal position.');
  if (unique.some(x => x.dimension === 'PLANNING')) addQ('PLANNING', 'What current planning or land-use record applies to this parcel?', 'Planning status should come from applicable records, not assumptions about the locality.');
  if (unique.some(x => x.dimension === 'DOCUMENT')) addQ('DOCUMENT', 'Which clause or document point needs professional review before signing?', 'Document screening identifies review points; it is not a legal opinion.');
  if (unique.some(x => x.dimension === 'INFRASTRUCTURE')) addQ('INFRASTRUCTURE', 'Which evidence supports current access and utility availability?', 'Property-level infrastructure should be checked against current evidence.');
  if (unique.some(x => x.dimension === 'WATER')) addQ('WATER', 'What current evidence supports the stated water availability?', 'No evidence is not evidence of absence or presence.');
  if (unique.some(x => x.dimension === 'FINANCIAL')) addQ('FINANCIAL', 'What costs, encumbrances or assumptions should be verified before calculating the total outlay?', 'Financial conclusions depend on verified inputs.');

  const profile = { purpose, riskPreference, timeline: timeline || null, financing: financing || null, budget, preferredAreas: Array.isArray(buyer?.areas) ? buyer.areas : [] };
  const decision = decisionIntelligence?.decision || 'REVIEW_NEGOTIATE';
  return {
    propertyId: property.id,
    generatedAt: new Date().toISOString(),
    buyerProfile: profile,
    currentDecisionState: decision,
    decisionContext: {
      note: 'Buyer context changes which verification questions are most relevant; it does not override property evidence or create a guarantee.',
      evidenceCount: evidence.length,
      unresolvedDimensions: decisionIntelligence?.decisionBasis?.unresolvedDimensions ?? null,
      unknownDimensions: decisionIntelligence?.decisionBasis?.unknownDimensions ?? null,
      conflictCount: decisionIntelligence?.decisionBasis?.conflictCount ?? null
    },
    prioritizedActions: unique.slice(0, 8),
    buyerQuestions: questions.slice(0, 10),
    profileGaps: [
      !timeline ? 'TIMELINE' : null,
      !financing ? 'FINANCING' : null,
      budget == null || budget === '' ? 'BUDGET' : null,
      riskPreference === 'UNKNOWN' ? 'RISK_PREFERENCE' : null
    ].filter(Boolean),
    principles: [
      'NO EVIDENCE ≠ NEGATIVE EVIDENCE',
      'Buyer context prioritizes verification; it does not change recorded evidence.',
      'No future return, title clearance, safety, or transaction outcome is guaranteed.'
    ]
  };
}

module.exports = { buyerDecisionAssistant };
