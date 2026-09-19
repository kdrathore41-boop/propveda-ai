const DAY=86400000;
function parseDate(v){const d=new Date(v);return Number.isNaN(d.getTime())?null:d;}
function clean(v){return String(v||'').trim();}
function buildPropertyTimeline({property,evidence=[],reports=[],audit=[],actions=[],documents=[],gis=[]}){
  const events=[];
  const add=(type,at,title,detail,meta={})=>{const d=parseDate(at)||new Date(0);events.push({id:`tl_${events.length+1}`,type,at:d.toISOString(),title,detail,meta});};
  evidence.forEach(e=>add('EVIDENCE',e.createdAt||e.observedAt,'Evidence recorded',`${e.dimension||'UNKNOWN'} · ${e.status||'NOT_CHECKED'} · ${e.confidence||'UNKNOWN'}`,{evidenceId:e.id,dimension:e.dimension,source:e.sourceKey||e.source,observedAt:e.observedAt}));
  reports.forEach(r=>add('REPORT',r.createdAt||r.generatedAt,'Intelligence report generated',`Report ${r.reportId||r.id||'—'} · version ${r.version||'—'}`,{reportId:r.reportId||r.id,version:r.version}));
  audit.forEach(a=>add('AUDIT',a.createdAt,'System audit event',clean(a.action)||'AUDIT_EVENT',{auditId:a.id,action:a.action}));
  actions.forEach(a=>add('ACTION',a.updatedAt||a.createdAt,'Workflow action',`${a.status||'OPEN'} · ${a.title||a.dimension||'Verification action'}`,{actionId:a.id,priority:a.priority,dimension:a.dimension,status:a.status}));
  documents.forEach(d=>add('DOCUMENT',d.createdAt,'Document analyzed',`${d.name||'Document'} · ${d.status||'UNRESOLVED'}`,{documentId:d.id,type:d.type}));
  gis.forEach(g=>add('GIS',g.createdAt||g.observedAt,'GIS evidence recorded',`${g.layer||g.type||'GIS layer'} · ${g.status||'RECORDED'}`,{gisId:g.id}));
  events.sort((a,b)=>new Date(b.at)-new Date(a.at));
  const counts={};events.forEach(e=>counts[e.type]=(counts[e.type]||0)+1);
  const first=events.length?events[events.length-1].at:null,last=events.length?events[0].at:null;
  return {propertyId:property.id,generatedAt:new Date().toISOString(),eventCount:events.length,firstEventAt:first,lastEventAt:last,counts,events:events.slice(0,200),summary:{evidenceCount:evidence.length,reportCount:reports.length,actionCount:actions.length,documentCount:documents.length,gisCount:gis.length,auditCount:audit.length},principles:['Timeline is an ordered view of stored records, not an assertion of external events.','Historical records are preserved as observations and workflow activity.','NO EVIDENCE ≠ NEGATIVE EVIDENCE']};
}
module.exports={buildPropertyTimeline};
