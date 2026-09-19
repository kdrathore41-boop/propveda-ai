const crypto = require('crypto');
const STATUSES = ['OPEN','IN_REVIEW','VERIFIED','PARTIALLY_VERIFIED','UNVERIFIED','CONFLICT'];
const RESULTS = ['VERIFIED','PARTIALLY_VERIFIED','UNVERIFIED','CONFLICT'];
function hash(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function now(){return new Date().toISOString();}
function buildVerificationCase({property,evidenceIds=[],sourceReference='',createdBy='SYSTEM',priority='MEDIUM',reason='Verification requested',existingCase=null}){
 const ids=[...new Set(evidenceIds)].filter(Boolean);
 return {caseId:existingCase?.caseId||`vcase_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,propertyId:property.id,status:existingCase?.status||'OPEN',priority,reason,sourceReference,evidenceIds:ids,createdBy:existingCase?.createdBy||createdBy,createdAt:existingCase?.createdAt||now(),updatedAt:now(),events:existingCase?.events||[{type:'CASE_CREATED',at:now(),actor:createdBy,details:{evidenceIds:ids,sourceReference}}],confidenceImpact:existingCase?.confidenceImpact||'UNKNOWN',reassessmentRequired:existingCase?.reassessmentRequired||false,principle:'NO EVIDENCE ≠ NEGATIVE EVIDENCE'};
}
function appendEvent(row,type,actor,details={}){const event={type,at:now(),actor:actor||'SYSTEM',details};row.events=[...(row.events||[]),event];row.updatedAt=event.at;return event;}
function applyResult(row,result,notes='',confidenceImpact='UNCHANGED',actor='SYSTEM'){
 if(!RESULTS.includes(result)) throw new Error('Invalid verification result');
 row.status=result; row.result=result; row.resultNotes=String(notes||''); row.confidenceImpact=confidenceImpact||'UNCHANGED'; row.reassessmentRequired=true; appendEvent(row,'VERIFICATION_RESULT_RECORDED',actor,{result,notes:row.resultNotes,confidenceImpact:row.confidenceImpact}); return row;
}
function buildWorkspace({property,cases=[],evidence=[]}){
 const linked=evidence.map(e=>({id:e.id,dimension:e.dimension,status:e.status,confidence:e.confidence,source:e.sourceKey||e.source||null,observation:e.observation||''}));
 const open=cases.filter(c=>['OPEN','IN_REVIEW'].includes(c.status));
 const byStatus=Object.fromEntries(STATUSES.map(s=>[s,cases.filter(c=>c.status===s).length]));
 return {propertyId:property.id,generatedAt:now(),cases:cases.slice().sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt)),evidence:linked,summary:{totalCases:cases.length,openCases:open.length,byStatus},nextActions:open.slice(0,8).map(c=>({caseId:c.caseId,priority:c.priority,status:c.status,action:'Review the linked source/evidence and record a verification result.',evidenceIds:c.evidenceIds||[],sourceReference:c.sourceReference||''})),principles:['Verification status describes the recorded review state; it is not a legal opinion or title certificate.','A conflict requires resolution or documented professional review; it is not automatically fraud.','NO EVIDENCE ≠ NEGATIVE EVIDENCE']};
}
module.exports={STATUSES,RESULTS,buildVerificationCase,appendEvent,applyResult,buildWorkspace,hash};
