function buildScenarioIntelligence({property,evidence,assessment,propertyIntelligence}){
  const rows=evidence||[];
  const dimensions=(assessment&&assessment.dimensions)||{};

  const supported=rows.filter(
    e=>e.status && e.status!=='NOT_CHECKED'
  );

  const gaps=Object.entries(dimensions).filter(
    ([,v])=>['NOT_CHECKED','UNRESOLVED','CONFLICTING'].includes(v.status)
  );

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
                  (rawCoverage.dimensionsCovered /
                  rawCoverage.totalDimensions)*100
                )
              : 0;

  const currentState={
    decision:assessment?.decision||'NOT_CHECKED',
    evidenceCount:rows.length,
    supportedEvidence:supported.length,
    coverage:coveragePercent,
    openDimensions:gaps.map(
      ([dimension,v])=>({
        dimension,
        status:v.status,
        confidence:v.confidence,
        evidenceCount:v.evidenceCount||0
      })
    )
  };

  const opportunitySignals=[];

  const infra=dimensions.INFRASTRUCTURE;
  const planning=dimensions.PLANNING;
  const project=dimensions.PROJECT;

  if(
    infra &&
    ['VERIFIED','PARTIALLY_VERIFIED'].includes(infra.status)
  ){
    opportunitySignals.push({
      code:'INFRASTRUCTURE_EVIDENCE',
      label:'Infrastructure evidence available',
      basis:'Infrastructure dimension contains attributed evidence.',
      confidence:infra.confidence||'UNKNOWN'
    });
  }

  if(
    planning &&
    ['VERIFIED','PARTIALLY_VERIFIED'].includes(planning.status)
  ){
    opportunitySignals.push({
      code:'PLANNING_EVIDENCE',
      label:'Planning evidence available',
      basis:'Planning dimension contains attributed evidence.',
      confidence:planning.confidence||'UNKNOWN'
    });
  }

  if(
    project &&
    ['VERIFIED','PARTIALLY_VERIFIED'].includes(project.status)
  ){
    opportunitySignals.push({
      code:'PROJECT_EVIDENCE',
      label:'Project evidence available',
      basis:'Project dimension contains attributed evidence.',
      confidence:project.confidence||'UNKNOWN'
    });
  }

  if(!opportunitySignals.length){
    opportunitySignals.push({
      code:'NO_SUPPORTED_OPPORTUNITY_SIGNAL',
      label:'No supported opportunity signal yet',
      basis:'Relevant evidence is not currently sufficient; this is not negative evidence.',
      confidence:'UNKNOWN'
    });
  }

  const riskScenarios=gaps
    .slice(0,6)
    .map(([dimension,v])=>({
      code:`${dimension}_UNCERTAINTY`,
      dimension,
      status:v.status,
      scenario:`A ${dimension.toLowerCase()} uncertainty could change the transaction decision if later evidence differs or remains unresolved.`,
      trigger:'Obtain and verify the missing or conflicting evidence.',
      confidence:v.confidence||'UNKNOWN'
    }));

  if(!riskScenarios.length){
    riskScenarios.push({
      code:'EVIDENCE_CHANGE',
      dimension:'GENERAL',
      status:'MONITORED',
      scenario:'New evidence could change the assessment.',
      trigger:'Refresh material source records before transaction commitment.',
      confidence:'UNKNOWN'
    });
  }

  const actions=gaps
    .slice()
    .sort(
      (a,b)=>
        (b[1].status==='CONFLICTING')-
        (a[1].status==='CONFLICTING')
    )
    .slice(0,5)
    .map(([dimension,v],i)=>({
      priority:i===0?'HIGH':i<3?'MEDIUM':'LOW',
      dimension,
      action:
        v.status==='CONFLICTING'
          ?'Resolve conflicting evidence from the relevant sources.'
          :`Obtain and verify evidence for ${dimension}.`
    }));

  return {
    generatedAt:new Date().toISOString(),
    propertyId:property?.id||null,
    propertyName:property?.name||null,
    currentState,
    opportunitySignals,
    riskScenarios,
    whatIf:[
      {
        condition:'Evidence gap closes',
        effect:'The decision state may change; re-run assessment after verification.'
      },
      {
        condition:'Conflict is confirmed',
        effect:'Keep the relevant dimension unresolved and seek professional review where appropriate.'
      }
    ],
    nextVerificationActions:actions,
    principles:[
      'Scenarios are not predictions or promises.',
      'Opportunity signals require supporting evidence.',
      'NO EVIDENCE ≠ NEGATIVE EVIDENCE.'
    ]
  };
}

module.exports={buildScenarioIntelligence};
