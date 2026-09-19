function clamp(n,min=0,max=100){ return Math.max(min,Math.min(max,n)); }

function buildPortfolio({properties,evidenceByProperty,assessments,objectives={}}){
  const rows=properties.map(p=>{
    const evidence=evidenceByProperty[p.id]||[];
    const assessment=assessments[p.id]||{};
    const dimensions=assessment.dimensions||{};
    const supported=Object.values(dimensions).filter(x=>x.status && x.status!=='NOT_CHECKED').length;
    const total=Object.keys(dimensions).length||8;
    const confidenceCounts={HIGH:0,MEDIUM:0,LOW:0,UNKNOWN:0};
    evidence.forEach(x=>confidenceCounts[x.confidence||'UNKNOWN']=(confidenceCounts[x.confidence||'UNKNOWN']||0)+1);
    const conflicts=evidence.filter(x=>x.status==='CONFLICTING').length;
    const dimensionGaps=Object.values(dimensions).filter(x=>['UNRESOLVED','CONFLICTING','NOT_CHECKED'].includes(x.status)).length;
    const unresolved=evidence.filter(x=>['UNRESOLVED','NOT_CHECKED'].includes(x.status)).length + dimensionGaps;
    const exposureSignals=[
      dimensions.TITLE?.status==='CONFLICTING'?'TITLE_CONFLICT':null,
      dimensions.LEGAL?.status==='CONFLICTING'?'LEGAL_CONFLICT':null,
      dimensions.FINANCIAL?.status==='CONFLICTING'?'FINANCIAL_CONFLICT':null,
      dimensions.PLANNING?.status==='CONFLICTING'?'PLANNING_CONFLICT':null
    ].filter(Boolean);
    return {
      propertyId:p.id, identity:p.propertyId||p.id, name:p.name, location:p.location,
      khasra:p.khasra||null, project:p.project||null, developer:p.developer||null,
      decision:assessment.decision||'NOT_CHECKED', evidenceCount:evidence.length,
      evidenceCoverage:Math.round((supported/total)*100), conflicts, unresolved,
      confidence:confidenceCounts, exposureSignals,
      verificationState:conflicts?'CONFLICTING':unresolved?'OPEN_GAPS':'SUPPORTED',
      objectiveFit: objectives[p.id]||'NOT_SET'
    };
  });
  const concentration={
    propertyCount:rows.length,
    byDistrict:rows.reduce((a,r)=>{const d=(r.location||'Unknown').split(',').slice(-2).join(',').trim()||'Unknown';a[d]=(a[d]||0)+1;return a;},{}),
    conflictProperties:rows.filter(r=>r.conflicts>0).map(r=>r.propertyId),
    openGapProperties:rows.filter(r=>r.unresolved>0).map(r=>r.propertyId)
  };
  return {generatedAt:new Date().toISOString(),portfolio:{objective:'Evidence-grounded portfolio visibility',properties:rows,concentration},principles:['NO EVIDENCE ≠ NEGATIVE EVIDENCE','Portfolio signals are decision-support, not valuation or return guarantees','Side-by-side comparison does not declare an overall winner']};
}

function comparePortfolio(rows, ids){
  const selected=(ids||[]).map(String).map(id=>rows.find(r=>r.propertyId===id || r.identity===id)).filter(Boolean);
  return {
    generatedAt:new Date().toISOString(),
    compared:selected.map(r=>({propertyId:r.propertyId,name:r.name,identity:r.identity,location:r.location,khasra:r.khasra,decision:r.decision,evidenceCoverage:r.evidenceCoverage,verificationState:r.verificationState,conflicts:r.conflicts,unresolved:r.unresolved,confidence:r.confidence,exposureSignals:r.exposureSignals,objectiveFit:r.objectiveFit})),
    dimensions:['identity','evidence','verification','confidence','risks','planning','GIS','market','valuation','open_questions','transaction_state'],
    note:'Comparison is descriptive. PropVeda does not rank properties or declare a winner.'
  };
}
module.exports={buildPortfolio,comparePortfolio};
