function buildEvidenceGraph({property,evidence,assessment,propertyIntelligence}) {
  const nodes=[]; const edges=[]; const seen=new Set();
  const addNode=(id,type,label,meta={})=>{ if(!seen.has(id)){seen.add(id);nodes.push({id,type,label,meta});} };
  addNode(`property:${property.id}`,'PROPERTY',property.name||property.propertyId,{propertyId:property.propertyId,location:property.location||''});
  addNode(`khasra:${property.khasra||'UNSPECIFIED'}`,'KHASRA',property.khasra||'Khasra not recorded');
  edges.push({from:`property:${property.id}`,to:`khasra:${property.khasra||'UNSPECIFIED'}`,type:'IDENTITY'});
  (evidence||[]).forEach(e=>{
    const eid=`evidence:${e.id}`, sid=`source:${e.sourceKey||e.source||'UNKNOWN'}`, did=`dimension:${String(e.dimension||'UNKNOWN').toUpperCase()}`;
    addNode(did,'DIMENSION',String(e.dimension||'UNKNOWN').toUpperCase(),{status:e.status||'NOT_CHECKED'});
    addNode(sid,'SOURCE',e.sourceKey||e.source||'UNKNOWN');
    addNode(eid,'EVIDENCE',e.observation||'Observation',{status:e.status||'NOT_CHECKED',confidence:e.confidence||'UNKNOWN',observedAt:e.observedAt||null,reference:e.reference||''});
    edges.push({from:`property:${property.id}`,to:did,type:'HAS_DIMENSION'});
    edges.push({from:did,to:eid,type:'OBSERVED_BY'});
    edges.push({from:eid,to:sid,type:'ATTRIBUTED_TO'});
  });
  const open=Object.entries((assessment&&assessment.dimensions)||{}).filter(([,v])=>['UNRESOLVED','CONFLICTING','NOT_CHECKED'].includes(v.status));
  addNode('decision:current','DECISION',assessment?.decision||'NOT_CHECKED',{openDimensions:open.length});
  edges.push({from:`property:${property.id}`,to:'decision:current',type:'DECISION_STATE'});
  return {generatedAt:new Date().toISOString(),propertyId:property.id,propertyReference:property.propertyId||null,nodes,edges,summary:{nodeCount:nodes.length,edgeCount:edges.length,evidenceCount:(evidence||[]).length,openDimensions:open.length,coverage:propertyIntelligence?.evidenceCoverage||null},principles:['Every evidence node remains attributed to its source.','Graph relationships are derived from stored records; they do not prove ownership or legal title.','NO EVIDENCE ≠ NEGATIVE EVIDENCE.']};
}
module.exports={buildEvidenceGraph};
