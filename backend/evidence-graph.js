function buildEvidenceGraph({property,evidence,assessment,propertyIntelligence}) {
  const nodes=[];
  const edges=[];
  const seen=new Set();

  const assessmentDimensions=(assessment&&assessment.dimensions)||{};

  const addNode=(id,type,label,meta={})=>{
    if(!seen.has(id)){
      seen.add(id);
      nodes.push({id,type,label,meta});
    }
  };

  addNode(
    `property:${property.id}`,
    'PROPERTY',
    property.name||property.propertyId,
    {
      propertyId:property.propertyId,
      location:property.location||''
    }
  );

  addNode(
    `khasra:${property.khasra||'UNSPECIFIED'}`,
    'KHASRA',
    property.khasra||'Khasra not recorded'
  );

  edges.push({
    from:`property:${property.id}`,
    to:`khasra:${property.khasra||'UNSPECIFIED'}`,
    type:'IDENTITY'
  });

  (evidence||[]).forEach(e=>{
    const dimension=String(e.dimension||'UNKNOWN').toUpperCase();
    const dimensionAssessment=assessmentDimensions[dimension];

    const dimensionStatus=
      dimensionAssessment?.status||
      e.status||
      'NOT_CHECKED';

    const dimensionConfidence=
      dimensionAssessment?.confidence||
      e.confidence||
      'UNKNOWN';

    const eid=`evidence:${e.id}`;
    const sid=`source:${e.sourceKey||e.source||'UNKNOWN'}`;
    const did=`dimension:${dimension}`;

    addNode(
      did,
      'DIMENSION',
      dimension,
      {
        status:dimensionStatus,
        confidence:dimensionConfidence,
        evidenceCount:dimensionAssessment?.evidenceCount||0
      }
    );

    addNode(
      sid,
      'SOURCE',
      e.sourceKey||e.source||'UNKNOWN'
    );

    addNode(
      eid,
      'EVIDENCE',
      e.observation||'Observation',
      {
        status:e.status||'NOT_CHECKED',
        confidence:e.confidence||'UNKNOWN',
        observedAt:e.observedAt||null,
        reference:e.reference||''
      }
    );

    edges.push({
      from:`property:${property.id}`,
      to:did,
      type:'HAS_DIMENSION'
    });

    edges.push({
      from:did,
      to:eid,
      type:'OBSERVED_BY'
    });

    edges.push({
      from:eid,
      to:sid,
      type:'ATTRIBUTED_TO'
    });
  });

  const open=Object.entries(assessmentDimensions)
    .filter(([,v])=>
      ['UNRESOLVED','CONFLICTING','NOT_CHECKED'].includes(v.status)
    );

  addNode(
    'decision:current',
    'DECISION',
    assessment?.decision||'NOT_CHECKED',
    {
      openDimensions:open.length
    }
  );

  edges.push({
    from:`property:${property.id}`,
    to:'decision:current',
    type:'DECISION_STATE'
  });

  const rawCoverage=propertyIntelligence?.evidenceCoverage;

  const coveragePercent=
    typeof rawCoverage==='number'
      ? rawCoverage
      : typeof rawCoverage?.percentage==='number'
        ? rawCoverage.percentage
        : typeof rawCoverage?.coveragePercent==='number'
          ? rawCoverage.coveragePercent
          : typeof rawCoverage?.dimensionsCovered==='number' &&
            typeof rawCoverage?.totalDimensions==='number' &&
            rawCoverage.totalDimensions>0
              ? Math.round(
                  (rawCoverage.dimensionsCovered/
                  rawCoverage.totalDimensions)*100
                )
              : 0;

  return {
    generatedAt:new Date().toISOString(),
    propertyId:property.id,
    propertyReference:property.propertyId||null,
    nodes,
    edges,
    summary:{
      nodeCount:nodes.length,
      edgeCount:edges.length,
      evidenceCount:(evidence||[]).length,
      openDimensions:open.length,
      coverage:coveragePercent
    },
    principles:[
      'Every evidence node remains attributed to its source.',
      'Graph relationships are derived from stored records; they do not prove ownership or legal title.',
      'NO EVIDENCE ≠ NEGATIVE EVIDENCE.'
    ]
  };
}

module.exports={buildEvidenceGraph};
