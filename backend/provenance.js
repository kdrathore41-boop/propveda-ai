const crypto=require('crypto');
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object'){return Object.keys(v).sort().reduce((o,k)=>{o[k]=stable(v[k]);return o},{});}return v;}
function fingerprint(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function buildProvenance({property,evidence=[],documents=[],gis=[],audit=[],actions=[],verificationCases=[]}){
 const events=[];
 const add=(type,ref,at,actor,source,payload)=>events.push({type,ref,at:at||null,actor:actor||'SYSTEM',source:source||null,fingerprint:fingerprint(payload||{}),payload:payload||{}});
 for(const e of evidence){add('EVIDENCE_RECORDED',e.id,e.createdAt||e.observedAt,e.recordedBy,e.sourceKey||e.source,{propertyId:property.id,dimension:e.dimension,status:e.status,observation:e.observation,reference:e.reference,rawEvidenceRef:e.rawEvidenceRef,verificationMethod:e.verificationMethod});}
 for(const d of documents){add('DOCUMENT_RECORDED',d.id,d.createdAt,d.recordedBy,d.sourceKey||d.source,{propertyId:property.id,type:d.type,status:d.status,name:d.name});}
 for(const g of gis){add('GIS_RECORD_RECORDED',g.id,g.createdAt,g.recordedBy,g.sourceKey||g.source,{propertyId:property.id,layer:g.layer,type:g.type,status:g.status});}
 for(const a of actions){add('ACTION_EVENT',a.id,a.createdAt,a.createdBy||a.actor,'SYSTEM',{propertyId:property.id,status:a.status,priority:a.priority,title:a.title,sourceRefs:a.sourceRefs||[]});}
 for(const v of verificationCases){add('VERIFICATION_CASE',v.id,v.createdAt,v.createdBy,v.sourceKey||v.source,{propertyId:property.id,status:v.status,evidenceIds:v.evidenceIds||[],sourceReference:v.sourceReference||''});}
 for(const a of audit){add('AUDIT_EVENT',a.id,a.createdAt,a.actor||'SYSTEM',a.details?.sourceKey||a.details?.source,{action:a.action,entityId:a.entityId,details:a.details||{}});}
 events.sort((a,b)=>new Date(a.at||0)-new Date(b.at||0));
 const chain=[]; let previousHash='GENESIS';
 for(const e of events){const link=fingerprint({previousHash,eventFingerprint:e.fingerprint,type:e.type,ref:e.ref,at:e.at});chain.push({...e,previousHash,chainHash:link});previousHash=link;}
 return {propertyId:property.id,eventCount:chain.length,events:chain,chainHead:previousHash,integrityHash:fingerprint(chain),principles:['Provenance records how information entered or changed within PropVeda; it does not certify external truth.','Chain hashes make the stored event sequence tamper-evident within the application state.','Source attribution is preserved when available; missing attribution remains missing.','NO EVIDENCE ≠ NEGATIVE EVIDENCE']};
}
function verifyProvenance(provenance){if(!provenance?.events)return {valid:false,reason:'No provenance events'};let prev='GENESIS';for(const e of provenance.events){const expected=fingerprint({previousHash:prev,eventFingerprint:e.fingerprint,type:e.type,ref:e.ref,at:e.at});if(e.previousHash!==prev||e.chainHash!==expected)return {valid:false,brokenEvent:e.ref};prev=e.chainHash;}return {valid:true,chainHead:prev,eventCount:provenance.events.length};}
module.exports={buildProvenance,verifyProvenance,fingerprint};
