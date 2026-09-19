const crypto=require('crypto');
const CORE_DIMENSIONS=['TITLE','LEGAL','FINANCIAL','PLANNING','INFRASTRUCTURE','WATER','DOCUMENT','PROJECT'];
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object'){return Object.keys(v).sort().reduce((o,k)=>{o[k]=stable(v[k]);return o},{});}return v;}
function hash(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function buildSnapshot({property,evidence=[],assessment=null,decisionIntelligence=null,watchtower=null,decisionReassessment=null,actionOrchestration=null,documents=[],gis=[],timeline=null,reason='MANUAL_SNAPSHOT',source='SYSTEM'}){
 const evidenceState=evidence.map(e=>({id:e.id,dimension:e.dimension,status:e.status,confidence:e.confidence,sourceKey:e.sourceKey||e.source,observedAt:e.observedAt,createdAt:e.createdAt})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 const dimensions={}; for(const d of CORE_DIMENSIONS){const rows=evidence.filter(e=>e.dimension===d);dimensions[d]={count:rows.length,statuses:[...new Set(rows.map(e=>e.status||'UNKNOWN'))].sort(),confidences:rows.map(e=>e.confidence).filter(v=>v!==undefined&&v!==null)};}
 const state={property:{id:property.id,propertyId:property.propertyId,name:property.name,location:property.location,tehsil:property.tehsil,khasra:property.khasra},assessment,decisionIntelligence,watchtower,decisionReassessment,actionOrchestration,dimensions,evidence:evidenceState,documents:documents.map(d=>({id:d.id,status:d.status,type:d.type,name:d.name})),gis:gis.map(g=>({id:g.id,status:g.status,layer:g.layer,type:g.type})),timelineSummary:timeline?.summary||null};
 const integrityHash=hash(state);
 return {snapshotId:`snap_${Date.now()}_${integrityHash.slice(0,10)}`,propertyId:property.id,createdAt:new Date().toISOString(),reason,source,integrityHash,schemaVersion:'1.0',decision:assessment?.decision||null,evidenceCount:evidence.length,state,principles:['Snapshot is an immutable representation of stored system state at creation time.','Hash provides integrity checking of the stored snapshot payload; it is not proof of external truth.','Snapshots do not create evidence and do not convert missing evidence into negative evidence.','NO EVIDENCE ≠ NEGATIVE EVIDENCE']};
}
function compareSnapshots(a,b){
 if(!a||!b)return null; const da=a.state?.dimensions||{},db=b.state?.dimensions||{}; const dimensions=[];
 for(const d of CORE_DIMENSIONS){const x=JSON.stringify(da[d]||{}),y=JSON.stringify(db[d]||{});if(x!==y)dimensions.push({dimension:d,before:da[d]||null,after:db[d]||null});}
 const decisionChanged=a.decision!==b.decision;
 const evidenceDelta=(b.evidenceCount||0)-(a.evidenceCount||0);
 return {fromSnapshotId:a.snapshotId,toSnapshotId:b.snapshotId,createdAt:new Date().toISOString(),decisionChanged,fromDecision:a.decision,toDecision:b.decision,evidenceDelta,changedDimensions:dimensions,changedDimensionCount:dimensions.length,hashChanged:a.integrityHash!==b.integrityHash,principles:['Comparison describes differences between stored snapshots; it does not infer causality.','A changed snapshot hash means stored state changed, not that an external source necessarily changed.']};
}
module.exports={buildSnapshot,compareSnapshots,CORE_DIMENSIONS};
