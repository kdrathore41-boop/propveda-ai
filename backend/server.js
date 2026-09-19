const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const FRONTEND = path.join(ROOT, 'frontend');
const { listSources, getSource, health: sourceHealth, readiness: sourceReadiness } = require('./source-registry');
const { connectorStatus, runConnector } = require('./source-connectors');
const { decisionIntelligence } = require('./decision-intelligence');
const { buyerDecisionAssistant } = require('./buyer-decision-assistant');
const { buildTransactionReadiness } = require('./transaction-readiness');
const { buildPortfolio, comparePortfolio } = require('./portfolio-intelligence');
const { buildScenarioIntelligence } = require('./scenario-intelligence');
const { buildEvidenceGraph } = require('./evidence-graph');
const { buildWatchtower } = require('./evidence-watchtower');
const { buildDecisionReassessment } = require('./decision-reassessment');
const { buildActionOrchestration } = require('./action-orchestration');
const { buildPropertyTimeline } = require('./property-timeline');
const { buildSnapshot, compareSnapshots } = require('./evidence-snapshot');
const { buildProvenance, verifyProvenance } = require('./provenance');
const { buildVerificationCase, appendEvent, applyResult, buildWorkspace, STATUSES, RESULTS } = require('./verification-workflow');
const files = {
  properties: path.join(DATA, 'properties.json'),
  evidence: path.join(DATA, 'evidence.json'),
  audit: path.join(DATA, 'audit.json'),
  documents: path.join(DATA, 'documents.json'),
  gis: path.join(DATA, 'gis_layers.json'),
  users: path.join(DATA, 'users.json'),
  user_property_interest: path.join(DATA, 'user_property_interest.json'),
  reports: path.join(DATA, 'reports.json'),
  actions: path.join(DATA, 'actions.json'),
  timeline: path.join(DATA, 'timeline.json'),
  snapshots: path.join(DATA, 'snapshots.json'),
  provenance: path.join(DATA, 'provenance.json'),
  consultations: path.join(DATA, 'consultations.json'),
  verification_cases: path.join(DATA, 'verification_cases.json'),
  crm_events: path.join(DATA, 'crm_events.json'),
  consents: path.join(DATA, 'consents.json'),
  buyers: path.join(DATA, 'buyers.json'),
  buyer_activity: path.join(DATA, 'buyer_activity.json')
};

const corsOrigin = process.env.CORS_ORIGIN || '*';
const corsOptions = { origin: corsOrigin.includes(',') ? corsOrigin.split(',').map(x => x.trim()).filter(Boolean) : corsOrigin };
app.use(cors(corsOptions));
app.disable('x-powered-by');
app.use((req,res,next)=>{ res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','SAMEORIGIN'); res.setHeader('Referrer-Policy','strict-origin-when-cross-origin'); next(); });
app.use(express.json({ limit: '1mb' }));
app.use(express.static(FRONTEND));

function read(name) { return JSON.parse(fs.readFileSync(files[name], 'utf8')); }
function write(name, value) { fs.writeFileSync(files[name], JSON.stringify(value, null, 2)); }
function id(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function audit(action, entityId, details = {}) {
  const rows = read('audit');
  rows.push({ id: id('aud'), action, entityId, details, createdAt: new Date().toISOString() });
  write('audit', rows.slice(-500));
}

const VALID_ACTION_STATUS = new Set(['OPEN','ACKNOWLEDGED','COMPLETED','DISMISSED']);
const VALID_STATUS = ['VERIFIED', 'PARTIALLY_VERIFIED', 'UNRESOLVED', 'CONFLICTING', 'NOT_CHECKED'];
const VALID_CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
const DECISIONS = ['PROCEED', 'PROCEED_AFTER_VERIFICATION', 'REVIEW_NEGOTIATE', 'HOLD', 'ESCALATE'];
const DOC_TYPES = ['AGREEMENT','SALE_DEED','ALLOTMENT','RERA','TITLE_RECORD','APPROVAL','OTHER'];
const CLAUSE_PATTERNS = [
  { code: 'UNILATERAL_CHANGE', label: 'Unilateral change / modification', pattern: /builder|developer.{0,80}(may|can).{0,40}(change|modify|alter)|change.{0,40}(plan|specification)/i, action: 'Review whether changes require buyer consent and whether an exit/refund remedy exists.' },
  { code: 'REFUND_RESTRICTION', label: 'Refund / cancellation restriction', pattern: /(no|non).{0,20}refund|refund.{0,40}(not|shall not)|cancell?ation.{0,50}(forfeit|non-refundable)/i, action: 'Check cancellation, forfeiture, and refund conditions against the transaction documents.' },
  { code: 'LIABILITY_LIMIT', label: 'Liability limitation', pattern: /(liability|liable).{0,80}(limited|limit|maximum|cap)/i, action: 'Review the liability cap, exclusions, and remedies available to the buyer.' },
  { code: 'POSSESSION_DELAY', label: 'Possession / delay clause', pattern: /(possession|handover).{0,80}(delay|delayed|extension|grace)/i, action: 'Check the contractual possession date, extensions, and delay consequences.' },
  { code: 'JURISDICTION', label: 'Jurisdiction clause', pattern: /jurisdiction.{0,80}(exclusive|only|shall)/i, action: 'Verify the stated jurisdiction and dispute-resolution mechanism with professional advice.' }
];

function ensureDataFile(name, fallback=[]) { if (!fs.existsSync(files[name])) write(name, fallback); }
ensureDataFile('documents');
ensureDataFile('gis');
ensureDataFile('users');
ensureDataFile('user_property_interest');
ensureDataFile('reports');
ensureDataFile('actions');
ensureDataFile('timeline');
ensureDataFile('snapshots');
ensureDataFile('provenance');
ensureDataFile('consultations');
ensureDataFile('verification_cases');
ensureDataFile('crm_events');
ensureDataFile('consents');
ensureDataFile('buyers');
ensureDataFile('buyer_activity');

function detectClauses(text='') {
  return CLAUSE_PATTERNS.filter(x => x.pattern.test(text)).map(x => ({ code:x.code, label:x.label, matched:true, action:x.action }));
}
function haversineKm(a,b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const r=6371, toRad=v=>v*Math.PI/180; const dLat=toRad(b.lat-a.lat), dLng=toRad(b.lng-a.lng);
  const h=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return r*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
function parseDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
function evidenceFreshness(e) {
  const d=parseDate(e.observedAt); if(!d) return {label:'UNKNOWN', ageDays:null};
  const age=Math.max(0, Math.floor((Date.now()-d.getTime())/86400000));
  return { label: age<=30?'FRESH':age<=180?'AGING':'STALE', ageDays:age };
}
function normalizeObservation(value) { return String(value||'').trim().toLowerCase().replace(/\\s+/g,' '); }
function crossCheckEvidence(propertyId) {
  const rows=read('evidence').filter(e=>e.propertyId===propertyId);
  const groups={};
  for(const e of rows){ const key=String(e.dimension||'UNKNOWN').toUpperCase(); (groups[key] ||= []).push(e); }
  const conflicts=[];
  for(const [dimension,items] of Object.entries(groups)) {
    const byObs={}; for(const e of items){ const o=normalizeObservation(e.observation); if(o) (byObs[o] ||= []).push(e); }
    const variants=Object.entries(byObs).filter(([,v])=>v.length);
    if(variants.length>1 && items.length>1) conflicts.push({dimension, variants:variants.map(([observation,ev])=>({observation,evidenceIds:ev.map(x=>x.id),sources:ev.map(x=>x.sourceKey||x.source)}))});
  }
  return {propertyId,evidenceCount:rows.length,conflicts,conflictCount:conflicts.length,checkedAt:new Date().toISOString()};
}
function evidenceIntelligence(propertyId) {
  const rows=read('evidence').filter(e=>e.propertyId===propertyId);
  const freshness=rows.map(e=>({evidenceId:e.id, ...evidenceFreshness(e)}));
  const conflicts=crossCheckEvidence(propertyId);
  const sourceCounts={}; rows.forEach(e=>{const k=e.sourceKey||e.source||'UNKNOWN'; sourceCounts[k]=(sourceCounts[k]||0)+1;});
  return {propertyId,generatedAt:new Date().toISOString(),evidenceCount:rows.length,freshness,sourceCounts,conflicts,principle:'NO EVIDENCE ≠ NEGATIVE EVIDENCE'};
}


function propertyIntelligence(propertyId) {
  const property = read('properties').find(p => p.id === propertyId || p.propertyId === propertyId);
  if (!property) return null;
  const rows = read('evidence').filter(e => e.propertyId === property.id);
  const dimensions = ['TITLE','LEGAL','FINANCIAL','PLANNING','INFRASTRUCTURE','WATER','DOCUMENT','PROJECT'];
  const byDim = {};
  const findings = [];
  const gaps = [];
  const freshnessSummary = { FRESH: 0, AGING: 0, STALE: 0, UNKNOWN: 0 };
  for (const d of dimensions) {
    const items = rows.filter(e => String(e.dimension || '').toUpperCase() === d);
    const fresh = items.map(e => evidenceFreshness(e));
    fresh.forEach(x => freshnessSummary[x.label]++);
    const statuses = [...new Set(items.map(e => e.status || 'NOT_CHECKED'))];
    const confidences = [...new Set(items.map(e => e.confidence || 'UNKNOWN'))];
    const conflicts = items.length > 1 && new Set(items.map(e => normalizeObservation(e.observation)).filter(Boolean)).size > 1;
    const verifiedCount = items.filter(e => e.status === 'VERIFIED').length;
    const unresolvedCount = items.filter(e => ['UNRESOLVED','CONFLICTING','NOT_CHECKED'].includes(e.status)).length;
    byDim[d] = { evidenceCount: items.length, statuses, confidences, verifiedCount, unresolvedCount, conflictObserved: conflicts,
      evidenceIds: items.map(e => e.id), freshness: fresh };
    if (!items.length) gaps.push({ dimension: d, reason: 'NO_EVIDENCE', action: 'Collect and verify authoritative evidence for this dimension.' });
    else if (conflicts || statuses.some(x => ['UNRESOLVED','CONFLICTING'].includes(x))) gaps.push({ dimension: d, reason: conflicts ? 'CONFLICTING_OBSERVATIONS' : 'UNRESOLVED_EVIDENCE', action: 'Resolve the conflicting or unresolved records before relying on this dimension.' });
    else if (items.some((e, i) => fresh[i].label === 'STALE')) gaps.push({ dimension: d, reason: 'STALE_EVIDENCE', action: 'Refresh the relevant source record before decision use.' });
    if (verifiedCount) findings.push({ dimension: d, type: 'VERIFIED_EVIDENCE_PRESENT', evidenceCount: verifiedCount, confidence: confidences.includes('HIGH') ? 'HIGH' : confidences.includes('MEDIUM') ? 'MEDIUM' : 'LOW_OR_UNKNOWN' });
  }
  const conflicts = crossCheckEvidence(property.id);
  const assessmentResult = assessment(property.id);
  return {
    propertyId: property.id,
    propertyReference: property.propertyId,
    generatedAt: new Date().toISOString(),
    decision: assessmentResult.decision,
    evidenceCoverage: { dimensionsCovered: dimensions.filter(d => byDim[d].evidenceCount > 0).length, totalDimensions: dimensions.length, evidenceCount: rows.length },
    dimensions: byDim,
    findings,
    verificationGaps: gaps,
    conflicts,
    freshnessSummary,
    explanation: 'This is an evidence-based summary of collected records. Missing evidence is not treated as a negative finding, and derived calculations are not treated as authoritative records.',
    nextActions: gaps.slice(0, 8).map(g => ({ dimension: g.dimension, action: g.action })),
    confidencePrinciple: 'Confidence reflects the available evidence and verification state; it is not a guarantee of title, value, safety, or future returns.'
  };
}

function buildDecisionIntelligence(propertyId) {
  const property = read('properties').find(p => p.id === propertyId || p.propertyId === propertyId);
  if (!property) return null;
  const evidence = read('evidence').filter(e => e.propertyId === property.id);
  const assessmentResult = assessment(property.id);
  const evidenceIntel = evidenceIntelligence(property.id);
  return decisionIntelligence(property.id, property, evidence, assessmentResult, evidenceIntel);
}

function report(propertyId) {
  const props=read('properties'); const p=props.find(x=>x.id===propertyId || x.propertyId===propertyId); if(!p) return null;
  const ev=read('evidence').filter(x=>x.propertyId===p.id); const docs=read('documents').filter(x=>x.propertyId===p.id);
  const layers=read('gis').filter(x=>x.propertyId===p.id); const a=assessment(p.id);
  const intelligence=evidenceIntelligence(p.id); const propertyIntel=propertyIntelligence(p.id); const decisionIntel=buildDecisionIntelligence(p.id); const buyerAssistant=buyerDecisionAssistant({property:p,buyer:{},evidence:ev,decisionIntelligence:decisionIntel}); const transactionReadiness=buildTransactionReadiness({property:p,evidence:ev,documents:docs,gis:layers,buyerAssistant,decisionIntelligence:decisionIntel}); const watchtower=buildWatchtower({property:p,evidence:ev,assessment:a,propertyIntelligence:propertyIntel}); const scenarioIntelligence=buildScenarioIntelligence({property:p,evidence:ev,assessment:a,propertyIntelligence:propertyIntel}); const decisionReassessment=buildDecisionReassessment({property:p,evidence:ev,assessment:a,watchtower,scenarioIntelligence}); const actionOrchestration=buildActionOrchestration({property:p,watchtower,decisionReassessment,existingActions:read('actions').filter(x=>x.propertyId===p.id)}); const propertyTimeline=buildPropertyTimeline({property:p,evidence:ev,reports:read('reports').filter(x=>x.property?.id===p.id),audit:read('audit').filter(x=>x.entityId===p.id || x.details?.propertyId===p.id),actions:read('actions').filter(x=>x.propertyId===p.id),documents:docs,gis:layers}); const snapshots=read('snapshots').filter(x=>x.propertyId===p.id); const verificationWorkspace=buildWorkspace({property:p,cases:read('verification_cases').filter(x=>x.propertyId===p.id),evidence:ev}); return { reportId:id('rpt'), version:3, generatedAt:new Date().toISOString(), property:p, executiveSnapshot:{ decision:a.decision, evidenceCount:ev.length, documentCount:docs.length, gisLayerCount:layers.length, conflictCount:intelligence.conflicts.conflictCount, coverage:propertyIntel.evidenceCoverage, principle:'NO EVIDENCE ≠ NEGATIVE EVIDENCE' }, assessment:a, evidenceIntelligence:intelligence, propertyIntelligence:propertyIntel, decisionIntelligence:decisionIntel, buyerDecisionAssistant:buyerAssistant, transactionReadiness, evidenceGraph:buildEvidenceGraph({property:p,evidence:ev,assessment:a,propertyIntelligence:propertyIntel}), evidenceWatchtower:watchtower, scenarioIntelligence, decisionReassessment, actionOrchestration, propertyTimeline, snapshotSummary:{count:snapshots.length,latest:snapshots[0]||null}, verificationWorkspace, provenanceSummary:buildProvenance({property:p,evidence:ev,documents:docs,gis:layers,audit:read('audit').filter(x=>x.entityId===p.id||x.details?.propertyId===p.id),actions:read('actions').filter(x=>x.propertyId===p.id),verificationCases:read('verification_cases')?.filter(x=>x.propertyId===p.id)||[]}), documents:docs, gis:layers, evidence:ev, evidenceIds:ev.map(x=>x.id), sourceReferences:[...new Set(ev.map(x=>x.sourceKey||x.source).filter(Boolean))], unresolved:ev.filter(x=>['UNRESOLVED','CONFLICTING','NOT_CHECKED'].includes(x.status)), disclaimer:'This report organizes available evidence. It is not a legal opinion, title certificate, valuation guarantee, or prediction of future returns.' };
}

function assessment(propertyId) {
  const props = read('properties');
  const property = props.find(p => p.id === propertyId);
  if (!property) return null;
  const evidence = read('evidence').filter(e => e.propertyId === propertyId);
  const dimensions = ['TITLE','LEGAL','FINANCIAL','PLANNING','INFRASTRUCTURE','WATER','DOCUMENT','PROJECT'];
  const byDim = Object.fromEntries(dimensions.map(d => [d, evidence.filter(e => e.dimension === d)]));
  const risks = {};
  for (const d of dimensions) {
    const rows = byDim[d];
    if (!rows.length) risks[d] = { status: 'NOT_CHECKED', confidence: 'UNKNOWN', evidenceCount: 0 };
    else {
      const statuses = new Set(rows.map(r => r.status));
      const confidence = rows.some(r => r.confidence === 'HIGH') ? 'HIGH' : rows.some(r => r.confidence === 'MEDIUM') ? 'MEDIUM' : rows.some(r => r.confidence === 'LOW') ? 'LOW' : 'UNKNOWN';
      risks[d] = { status: statuses.has('CONFLICTING') ? 'CONFLICTING' : statuses.has('UNRESOLVED') ? 'UNRESOLVED' : statuses.has('PARTIALLY_VERIFIED') ? 'PARTIALLY_VERIFIED' : 'VERIFIED', confidence, evidenceCount: rows.length };
    }
  }
  const unresolved = Object.values(risks).filter(r => ['NOT_CHECKED','UNRESOLVED','CONFLICTING'].includes(r.status)).length;
  const decision = unresolved === 0 ? 'PROCEED' : unresolved <= 2 ? 'PROCEED_AFTER_VERIFICATION' : unresolved <= 4 ? 'REVIEW_NEGOTIATE' : 'HOLD';
  return { propertyId, generatedAt: new Date().toISOString(), dimensions: risks, decision, principle: 'NO EVIDENCE ≠ NEGATIVE EVIDENCE' };
}


function n(value) { if (value === null || value === undefined || value === '') return null; const x=Number(String(value).replace(/[^0-9.\-]/g,'')); return Number.isFinite(x)?x:null; }
function arr(value) { return Array.isArray(value) ? value : (value ? [value] : []); }
function buyerProfile(body={}) { return { buyerId: body.buyerId || id('buyer'), name: body.name || '', budgetMin:n(body.budgetMin), budgetMax:n(body.budgetMax ?? body.budget), locations:arr(body.locations), propertyTypes:arr(body.propertyTypes), purpose:String(body.purpose||'GENERAL').toUpperCase(), sizeMin:n(body.sizeMin), sizeMax:n(body.sizeMax), timeline:body.timeline||null, priorities:arr(body.priorities), dealBreakers:arr(body.dealBreakers), riskPreference:String(body.riskPreference||'UNKNOWN').toUpperCase(), createdAt:body.createdAt||new Date().toISOString(), updatedAt:new Date().toISOString() }; }
function parseBuyerQuery(q='') {
  const text=String(q).trim(); const low=text.toLowerCase();
  const out={query:text,locations:[],propertyTypes:[],purpose:null,budgetMax:null,sizeMin:null,sizeMax:null,needsFollowUp:[]};
  const locPatterns=[
    /(?:^|\s)(?:in|at)\s+([a-z][a-z .-]{2,40}?)(?=\s+(?:for|ke|tak|under|below|around|upto|up to|chahiye|hai|mein|me|$))/i,
    /^([a-z][a-z .-]{2,40}?)\s+(?:mein|me)\b/i,
    /^(.{2,40}?)\s+(?:में|मे)(?=\s|$|[,.-])/u,
    /\b([a-z][a-z .-]{2,40}?)\s+(?:mein|me)\b/i
  ];
  for(const re of locPatterns){ const m=text.match(re); if(m?.[1]){ const value=m[1].trim().replace(/[.,]+$/,''); if(value && !/^(investment|residential|commercial|property|plot|flat|house)$/i.test(value)){ out.locations=[value]; break; } } }
  if(/(?:\bplot\b|\bland\b|\bsite\b|प्लॉट|जमीन|भूमि)/iu.test(text)) out.propertyTypes=['PLOT'];
  else if(/(?:\bflat\b|\bapartment\b|फ्लैट|अपार्टमेंट)/iu.test(text)) out.propertyTypes=['FLAT'];
  else if(/(?:\bhouse\b|\bhome\b|\bduplex\b|\btriplex\b|घर)/iu.test(text)) out.propertyTypes=['HOUSE'];
  if(/investment|invest|निवेश/i.test(low)) out.purpose='INVESTMENT';
  else if(/residen|ghar ke liye|रहने|residential/i.test(low)) out.purpose='RESIDENCE';
  else if(/commercial|व्यावसाय/i.test(low)) out.purpose='COMMERCIAL';
  const moneyRe=/(?:₹|rs\.?\s*)?([0-9]+(?:\.[0-9]+)?)\s*(crore|cr|करोड़|करod|lakh|lac|लाख|l|k|thousand)(?=\s|$|[.,])/iu;
  const money=text.match(moneyRe);
  if(money){ let v=Number(money[1]); const u=money[2].toLowerCase();
    if(['crore','cr','करोड़','करod'].includes(u)) v*=10000000;
    else if(['lakh','lac','लाख','l'].includes(u)) v*=100000;
    else if(['k','thousand'].includes(u)) v*=1000;
    if(/(?:tak|under|below|upto|up to|budget|बजट|तक|के अंदर|से कम|less than)/i.test(text)) out.budgetMax=v;
  }
  if(!out.locations.length) out.needsFollowUp.push('LOCATION');
  if(!out.propertyTypes.length) out.needsFollowUp.push('PROPERTY_TYPE');
  if(out.budgetMax==null) out.needsFollowUp.push('BUDGET');
  return out;
}
function propertyTokens(p){ return arr([p.features,p.amenities,p.tags,p.highlights].flat().filter(Boolean)).map(x=>String(x).toLowerCase()); }
function matchBuyer(b,p) {
  const reasons=[], needs=[]; const price=n(p.price ?? p.askingPrice); const size=n(p.size ?? p.area);
  const loc=String(p.location||'').toLowerCase(); const type=String(p.propertyType||p.type||'').toUpperCase();
  if(b.budgetMax!=null){ if(price==null) needs.push('BUDGET_CONFIRMATION'); else if(price>b.budgetMax) return null; else reasons.push({factor:'BUDGET',state:'MATCH'}); }
  if(b.locations?.length){ const hit=b.locations.some(x=>loc.includes(String(x).toLowerCase())); if(!hit) return null; reasons.push({factor:'LOCATION',state:'MATCH'}); }
  if(b.propertyTypes?.length){ if(!type) needs.push('PROPERTY_TYPE_CONFIRMATION'); else if(!b.propertyTypes.includes(type)) return null; else reasons.push({factor:'PROPERTY_TYPE',state:'MATCH'}); }
  if(b.sizeMin!=null||b.sizeMax!=null){ if(size==null) needs.push('SIZE_CONFIRMATION'); else { if(b.sizeMin!=null&&size<b.sizeMin)return null; if(b.sizeMax!=null&&size>b.sizeMax)return null; reasons.push({factor:'SIZE',state:'MATCH'}); } }
  if(b.purpose && b.purpose!=='GENERAL'){
    const pp=String(p.purpose||'').toUpperCase(); if(pp) reasons.push({factor:'PURPOSE',state:pp===b.purpose?'MATCH':'DIFFERENT'}); else needs.push('PURPOSE_CONFIRMATION');
  }
  const tokens=propertyTokens(p);
  const priorities=arr(b.priorities).map(x=>String(x).toLowerCase()).filter(Boolean);
  if(priorities.length){ const hits=priorities.filter(x=>tokens.some(t=>t.includes(x)||x.includes(t))); reasons.push({factor:'PREFERENCES',state:hits.length?'PARTIAL_MATCH':'NOT_CONFIRMED',matched:hits}); if(!hits.length) needs.push('PREFERENCES_CONFIRMATION'); }
  const ev=read('evidence').filter(e=>e.propertyId===p.id); if(ev.length) reasons.push({factor:'EVIDENCE',state:'AVAILABLE',count:ev.length}); else needs.push('EVIDENCE_NOT_CHECKED');
  const matched=reasons.filter(x=>x.state==='MATCH').length; const fit=matched>=3?'STRONG_FIT':matched>=1?'PARTIAL_FIT':'LOW_FIT';
  return {propertyId:p.id,fit,reasons,needsConfirmation:needs,principle:'Fit is explanatory, not a quality score or commercial ranking.'};
}
function sortDiscovery(rows, sort='relevant') {
  const copy=[...rows];
  if(sort==='price_asc') return copy.sort((a,b)=>(n(a.property.price??a.property.askingPrice)??Infinity)-(n(b.property.price??b.property.askingPrice)??Infinity));
  if(sort==='size') return copy.sort((a,b)=>(n(b.property.size??b.property.area)??-Infinity)-(n(a.property.size??a.property.area)??-Infinity));
  if(sort==='updated') return copy.sort((a,b)=>String(b.property.updatedAt||b.property.createdAt||'').localeCompare(String(a.property.updatedAt||a.property.createdAt||'')));
  if(sort==='evidence') return copy.sort((a,b)=>(b.reasons.find(x=>x.factor==='EVIDENCE')?.count||0)-(a.reasons.find(x=>x.factor==='EVIDENCE')?.count||0));
  return copy.sort((a,b)=>({STRONG_FIT:3,PARTIAL_FIT:2,LOW_FIT:1}[b.fit]||0)-({STRONG_FIT:3,PARTIAL_FIT:2,LOW_FIT:1}[a.fit]||0));
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'PropVeda AI MVP', version: '1.4.1', modules: ['property_identity','evidence_graph','verification','risk_decision','document_intelligence','gis','reports','crm','consent','automation','source_registry','evidence_ingestion','report_versioning','source_connectors','property_intelligence','decision_intelligence','buyer_decision_assistant','transaction_readiness','portfolio_intelligence','scenario_intelligence','evidence_graph_visualizer','evidence_watchtower','decision_reassessment','action_orchestration','property_timeline','evidence_snapshot_engine','evidence_provenance_chain','verification_case_workspace'] }));
app.get('/api/sources', (req,res) => res.json({ generatedAt:new Date().toISOString(), sources:listSources() }));
app.get('/api/sources/health', (req,res) => res.json({ generatedAt:new Date().toISOString(), sources:sourceHealth() }));
app.get('/api/readiness', (req,res) => res.json({ generatedAt:new Date().toISOString(), service:'PropVeda AI MVP', version:'1.4.1', sourceRegistry:sourceReadiness(), connectorRegistry:{total:connectorStatus().length, automatedFetch:0, scaffoldReady:connectorStatus().filter(x=>x.status==='SCAFFOLD_READY').length}, environment:{ node:process.version, corsConfigured:Boolean(process.env.CORS_ORIGIN), port:Number(PORT) }, runtimeDependencies:{ express:true, cors:true }, productionNote:'Dependency installation and live runtime verification must be completed in the deployment environment.' }));
app.get('/api/sources/:key', (req,res) => { const s=getSource(req.params.key); if(!s) return res.status(404).json({error:'Source not found'}); res.json(s); });
app.get('/api/connectors', (req,res) => res.json({ generatedAt:new Date().toISOString(), connectors:connectorStatus() }));
app.post('/api/properties/:id/source-check/:key', (req,res) => {
  const property=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id);
  if(!property) return res.status(404).json({error:'Property not found'});
  const result=runConnector(req.params.key, property);
  if(!result.ok) return res.status(404).json(result);
  audit('SOURCE_CHECK_REQUESTED', property.id, { sourceKey:result.source.key, status:result.connector.status });
  res.json({ generatedAt:new Date().toISOString(), ...result, principle:'NO EVIDENCE ≠ NEGATIVE EVIDENCE' });
});

// Normalizes external/manual source observations into the existing Evidence Graph schema.
app.post('/api/properties/:id/evidence/ingest', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id); if(!p) return res.status(404).json({error:'Property not found'});
  const b=req.body||{}; const sourceKey=String(b.sourceKey||'').toUpperCase(); const source=getSource(sourceKey);
  if(!source) return res.status(400).json({error:'Unknown sourceKey'});
  if(!b.dimension || !b.observation) return res.status(400).json({error:'dimension and observation are required'});
  const row={ id:id('ev'), propertyId:p.id, dimension:String(b.dimension).toUpperCase(), observation:String(b.observation), source:source.name,
    sourceKey:source.key, reference:b.reference||'', observedAt:b.observedAt||new Date().toISOString(),
    status:VALID_STATUS.includes(b.status)?b.status:'NOT_CHECKED', confidence:VALID_CONFIDENCE.includes(b.confidence)?b.confidence:'UNKNOWN',
    verificationMethod:b.verificationMethod||source.accessMethod, rawEvidenceRef:b.rawEvidenceRef||'', notes:b.notes||'', createdAt:new Date().toISOString() };
  const rows=read('evidence'); rows.push(row); write('evidence',rows); audit('EVIDENCE_INGESTED',row.id,{propertyId:p.id,sourceKey:source.key,dimension:row.dimension}); res.status(201).json(row);
});

app.get('/api/properties/:id/timeline', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id);
  if(!p) return res.status(404).json({error:'Property not found'});
  const result=buildPropertyTimeline({property:p,evidence:read('evidence').filter(x=>x.propertyId===p.id),reports:read('reports').filter(x=>x.property?.id===p.id),audit:read('audit').filter(x=>x.entityId===p.id || x.details?.propertyId===p.id),actions:read('actions').filter(x=>x.propertyId===p.id),documents:read('documents').filter(x=>x.propertyId===p.id),gis:read('gis').filter(x=>x.propertyId===p.id)});
  write('timeline',read('timeline').filter(x=>x.propertyId!==p.id).concat({propertyId:p.id,snapshot:result,createdAt:new Date().toISOString()}));
  res.json(result);
});

app.get('/api/properties/:id/evidence-watchtower', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id);
  if(!p) return res.status(404).json({error:'Property not found'});
  const evidence=read('evidence').filter(x=>x.propertyId===p.id);
  const assessmentResult=assessment(p.id);
  const propertyIntel=propertyIntelligence(p.id);
  res.json(buildWatchtower({property:p,evidence,assessment:assessmentResult,propertyIntelligence:propertyIntel}));
});

app.get('/api/properties/:id/decision-reassessment', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id);
  if(!p) return res.status(404).json({error:'Property not found'});
  const evidence=read('evidence').filter(x=>x.propertyId===p.id); const a=assessment(p.id); const pi=propertyIntelligence(p.id);
  const wt=buildWatchtower({property:p,evidence,assessment:a,propertyIntelligence:pi});
  const si=buildScenarioIntelligence({property:p,evidence,assessment:a,propertyIntelligence:pi});
  res.json(buildDecisionReassessment({property:p,evidence,assessment:a,watchtower:wt,scenarioIntelligence:si}));
});

app.get('/api/properties/:id/action-orchestration', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id);
  if(!p) return res.status(404).json({error:'Property not found'});
  const evidence=read('evidence').filter(x=>x.propertyId===p.id); const a=assessment(p.id); const pi=propertyIntelligence(p.id);
  const wt=buildWatchtower({property:p,evidence,assessment:a,propertyIntelligence:pi});
  const si=buildScenarioIntelligence({property:p,evidence,assessment:a,propertyIntelligence:pi});
  const dr=buildDecisionReassessment({property:p,evidence,assessment:a,watchtower:wt,scenarioIntelligence:si});
  const result=buildActionOrchestration({property:p,watchtower:wt,decisionReassessment:dr,existingActions:read('actions').filter(x=>x.propertyId===p.id)});
  const rows=read('actions').filter(x=>x.propertyId!==p.id).concat(result.allActions); write('actions',rows);
  res.json({...result, allActions:undefined});
});

app.post('/api/properties/:id/action-orchestration/:actionId/status', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id); if(!p) return res.status(404).json({error:'Property not found'});
  const rows=read('actions'); const row=rows.find(x=>x.propertyId===p.id && x.id===req.params.actionId); if(!row) return res.status(404).json({error:'Action not found'});
  const status=String(req.body?.status||'').toUpperCase(); if(!VALID_ACTION_STATUS.includes(status)) return res.status(400).json({error:'Invalid action status'});
  row.status=status; row.updatedAt=new Date().toISOString(); if(status==='COMPLETED') row.completedAt=row.updatedAt; write('actions',rows); audit('ACTION_STATUS_UPDATED',p.id,{actionId:row.id,status}); res.json(row);
});

app.get('/api/properties/:id/evidence-graph', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id);
  if(!p) return res.status(404).json({error:'Property not found'});
  const evidence=read('evidence').filter(x=>x.propertyId===p.id);
  res.json(buildEvidenceGraph({property:p,evidence,assessment:assessment(p.id),propertyIntelligence:propertyIntelligence(p.id)}));
});

app.get('/api/properties/:id/scenario-intelligence', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id);
  if(!p) return res.status(404).json({error:'Property not found'});
  const evidence=read('evidence').filter(x=>x.propertyId===p.id);
  const assessmentResult=assessment(p.id);
  const propertyIntel=propertyIntelligence(p.id);
  res.json(buildScenarioIntelligence({property:p,evidence,assessment:assessmentResult,propertyIntelligence:propertyIntel}));
});

app.get('/api/portfolio/intelligence', (req,res) => {
  const properties=read('properties');
  const evidence=read('evidence');
  const evidenceByProperty=Object.fromEntries(properties.map(p=>[p.id,evidence.filter(e=>e.propertyId===p.id)]));
  const assessments=Object.fromEntries(properties.map(p=>[p.id,assessment(p.id)]));
  res.json(buildPortfolio({properties,evidenceByProperty,assessments}));
});
app.get('/api/portfolio/compare', (req,res) => {
  const properties=read('properties'); const evidence=read('evidence');
  const evidenceByProperty=Object.fromEntries(properties.map(p=>[p.id,evidence.filter(e=>e.propertyId===p.id)]));
  const assessments=Object.fromEntries(properties.map(p=>[p.id,assessment(p.id)]));
  const portfolio=buildPortfolio({properties,evidenceByProperty,assessments});
  const ids=String(req.query.ids||'').split(',').map(x=>x.trim()).filter(Boolean);
  res.json(comparePortfolio(portfolio.portfolio.properties,ids));
});


app.get('/api/properties/:id/verification-workspace', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id);
  if(!p) return res.status(404).json({error:'Property not found'});
  res.json(buildWorkspace({property:p,cases:read('verification_cases').filter(x=>x.propertyId===p.id),evidence:read('evidence').filter(x=>x.propertyId===p.id)}));
});
app.post('/api/properties/:id/verification-cases', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id);
  if(!p) return res.status(404).json({error:'Property not found'});
  const body=req.body||{}, ev=read('evidence').filter(x=>x.propertyId===p.id);
  const ids=[...new Set(Array.isArray(body.evidenceIds)?body.evidenceIds:[])];
  if(ids.some(x=>!ev.some(e=>e.id===x))) return res.status(400).json({error:'One or more evidenceIds are not linked to this property'});
  const row=buildVerificationCase({property:p,evidenceIds:ids,sourceReference:body.sourceReference||'',createdBy:body.createdBy||'USER',priority:String(body.priority||'MEDIUM').toUpperCase(),reason:body.reason||'Verification requested'});
  const rows=read('verification_cases'); rows.push(row); write('verification_cases',rows); audit('VERIFICATION_CASE_CREATED',p.id,{caseId:row.caseId,evidenceIds:ids,sourceReference:row.sourceReference}); res.status(201).json(row);
});
app.post('/api/properties/:id/verification-cases/:caseId/start', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id); if(!p) return res.status(404).json({error:'Property not found'});
  const rows=read('verification_cases'); const row=rows.find(x=>x.propertyId===p.id&&x.caseId===req.params.caseId); if(!row) return res.status(404).json({error:'Verification case not found'});
  row.status='IN_REVIEW'; appendEvent(row,'CASE_REVIEW_STARTED',req.body?.actor||'USER',{}); write('verification_cases',rows); audit('VERIFICATION_CASE_STARTED',p.id,{caseId:row.caseId}); res.json(row);
});
app.post('/api/properties/:id/verification-cases/:caseId/result', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id); if(!p) return res.status(404).json({error:'Property not found'});
  const rows=read('verification_cases'); const row=rows.find(x=>x.propertyId===p.id&&x.caseId===req.params.caseId); if(!row) return res.status(404).json({error:'Verification case not found'});
  const result=String(req.body?.result||'').toUpperCase(); if(!RESULTS.includes(result)) return res.status(400).json({error:'Invalid verification result'});
  applyResult(row,result,req.body?.notes||'',req.body?.confidenceImpact||'UNCHANGED',req.body?.actor||'USER');
  write('verification_cases',rows); audit('VERIFICATION_RESULT_RECORDED',p.id,{caseId:row.caseId,result,confidenceImpact:row.confidenceImpact,reassessmentRequired:true}); res.json(row);
});
app.get('/api/properties/:id/verification-cases/:caseId', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id); if(!p) return res.status(404).json({error:'Property not found'});
  const row=read('verification_cases').find(x=>x.propertyId===p.id&&x.caseId===req.params.caseId); if(!row) return res.status(404).json({error:'Verification case not found'}); res.json(row);
});

app.get('/api/properties/:id/provenance', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id);
  if(!p) return res.status(404).json({error:'Property not found'});
  const result=buildProvenance({property:p,evidence:read('evidence').filter(x=>x.propertyId===p.id),documents:read('documents').filter(x=>x.propertyId===p.id),gis:read('gis').filter(x=>x.propertyId===p.id),audit:read('audit').filter(x=>x.entityId===p.id || x.details?.propertyId===p.id),actions:read('actions').filter(x=>x.propertyId===p.id),verificationCases:read('verification_cases').filter(x=>x.propertyId===p.id)});
  write('provenance',read('provenance').filter(x=>x.propertyId!==p.id).concat({propertyId:p.id,snapshot:result,createdAt:new Date().toISOString()}));
  res.json({...result,verification:verifyProvenance(result)});
});

app.get('/api/properties/:id/snapshots', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id); if(!p) return res.status(404).json({error:'Property not found'});
  const rows=read('snapshots').filter(x=>x.propertyId===p.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  res.json({propertyId:p.id,count:rows.length,snapshots:rows.map(x=>({snapshotId:x.snapshotId,createdAt:x.createdAt,reason:x.reason,source:x.source,decision:x.decision,evidenceCount:x.evidenceCount,integrityHash:x.integrityHash,schemaVersion:x.schemaVersion}))});
});
app.post('/api/properties/:id/snapshots', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id || x.propertyId===req.params.id); if(!p) return res.status(404).json({error:'Property not found'});
  const ev=read('evidence').filter(x=>x.propertyId===p.id), docs=read('documents').filter(x=>x.propertyId===p.id), gis=read('gis').filter(x=>x.propertyId===p.id);
  const a=assessment(p.id), pi=propertyIntelligence(p.id), di=buildDecisionIntelligence(p.id), wt=buildWatchtower({property:p,evidence:ev,assessment:a,propertyIntelligence:pi});
  const dr=buildDecisionReassessment({property:p,evidence:ev,assessment:a,watchtower:wt,scenarioIntelligence:buildScenarioIntelligence({property:p,evidence:ev,assessment:a,propertyIntelligence:pi})});
  const ao=buildActionOrchestration({property:p,watchtower:wt,decisionReassessment:dr,existingActions:read('actions').filter(x=>x.propertyId===p.id)});
  const tl=buildPropertyTimeline({property:p,evidence:ev,reports:read('reports').filter(x=>x.property?.id===p.id),audit:read('audit').filter(x=>x.entityId===p.id || x.details?.propertyId===p.id),actions:read('actions').filter(x=>x.propertyId===p.id),documents:docs,gis});
  const row=buildSnapshot({property:p,evidence:ev,assessment:a,decisionIntelligence:di,watchtower:wt,decisionReassessment:dr,actionOrchestration:ao,documents:docs,gis,timeline:tl,reason:req.body?.reason||'MANUAL_SNAPSHOT',source:req.body?.source||'SYSTEM'});
  const rows=read('snapshots'); rows.push(row); write('snapshots',rows); audit('PROPERTY_SNAPSHOT_CREATED',p.id,{snapshotId:row.snapshotId,reason:row.reason,integrityHash:row.integrityHash}); res.status(201).json(row);
});
app.get('/api/properties/:id/snapshots/compare', (req,res) => {
  const rows=read('snapshots').filter(x=>x.propertyId===req.params.id); const a=rows.find(x=>x.snapshotId===req.query.from), b=rows.find(x=>x.snapshotId===req.query.to);
  if(!a||!b)return res.status(400).json({error:'Valid from and to snapshot IDs are required'}); res.json(compareSnapshots(a,b));
});
app.get('/api/properties/:id/snapshots/:snapshotId', (req,res) => { const row=read('snapshots').find(x=>x.propertyId===req.params.id&&x.snapshotId===req.params.snapshotId); if(!row)return res.status(404).json({error:'Snapshot not found'}); res.json(row); });


app.get('/api/buyers', (req,res) => res.json(read('buyers')));
app.post('/api/buyers', (req,res) => { const row=buyerProfile(req.body||{}); const rows=read('buyers'); rows.push(row); write('buyers',rows.slice(-500)); audit('BUYER_PROFILE_CREATED',row.buyerId,{purpose:row.purpose}); res.status(201).json(row); });
app.get('/api/buyers/:buyerId', (req,res) => { const row=read('buyers').find(x=>x.buyerId===req.params.buyerId); if(!row)return res.status(404).json({error:'Buyer not found'}); res.json(row); });
app.patch('/api/buyers/:buyerId', (req,res) => { const rows=read('buyers'); const row=rows.find(x=>x.buyerId===req.params.buyerId); if(!row)return res.status(404).json({error:'Buyer not found'}); Object.assign(row,buyerProfile({...row,...req.body}),{buyerId:row.buyerId,createdAt:row.createdAt,updatedAt:new Date().toISOString()}); write('buyers',rows); audit('BUYER_PROFILE_UPDATED',row.buyerId); res.json(row); });
app.post('/api/buyers/query', (req,res) => { const parsed=parseBuyerQuery(req.body?.query||''); res.json({parsed,principle:'Parsed requirements are suggestions and require user confirmation before hard filtering.'}); });
app.post('/api/buyers/:buyerId/activity', (req,res) => { const allowed=new Set(['SEARCH','VIEW','SAVE','COMPARE','ENQUIRY','CONSULTATION']); const type=String(req.body?.type||'').toUpperCase(); if(!allowed.has(type)) return res.status(400).json({error:'Invalid activity type',allowed:[...allowed]}); const buyer=read('buyers').find(x=>x.buyerId===req.params.buyerId); if(!buyer)return res.status(404).json({error:'Buyer not found'}); const row={activityId:id('activity'),buyerId:buyer.buyerId,type,propertyId:req.body?.propertyId||null,metadata:req.body?.metadata||{},createdAt:new Date().toISOString(),principle:'Activity is a signal, not proof of purchase intent.'}; const rows=read('buyer_activity'); rows.push(row); write('buyer_activity',rows.slice(-5000)); audit('BUYER_ACTIVITY_RECORDED',buyer.buyerId,{type,propertyId:row.propertyId}); res.status(201).json(row); });
app.get('/api/buyers/:buyerId/activity', (req,res) => { const buyer=read('buyers').find(x=>x.buyerId===req.params.buyerId); if(!buyer)return res.status(404).json({error:'Buyer not found'}); res.json(read('buyer_activity').filter(x=>x.buyerId===buyer.buyerId).slice(-200)); });
app.get('/api/buyers/:buyerId/matches', (req,res) => { const b=read('buyers').find(x=>x.buyerId===req.params.buyerId); if(!b)return res.status(404).json({error:'Buyer not found'}); const matches=read('properties').map(p=>{const m=matchBuyer(b,p); return m?{...m,property:p}:null}).filter(Boolean); res.json({buyerId:b.buyerId,count:matches.length,matches,noResultInsight:matches.length?null:'No property currently satisfies the available hard requirements. You can broaden location, budget, size or type.'}); });
app.get('/api/discovery', (req,res) => { const parsed=req.query.q?parseBuyerQuery(req.query.q):{}; const b=req.query.buyerId ? read('buyers').find(x=>x.buyerId===req.query.buyerId) : buyerProfile({budgetMax:req.query.maxBudget||parsed.budgetMax,locations:req.query.location?[req.query.location]:parsed.locations,propertyTypes:req.query.type?[String(req.query.type).toUpperCase()]:parsed.propertyTypes,sizeMin:req.query.minSize||parsed.sizeMin,sizeMax:req.query.maxSize||parsed.sizeMax,purpose:req.query.purpose||parsed.purpose||'GENERAL'}); if(!b)return res.status(404).json({error:'Buyer not found'}); const raw=read('properties').map(p=>{const m=matchBuyer(b,p); return m?{...m,property:p}:null}).filter(Boolean); const requestedSort=String(req.query.sort||'relevant').toLowerCase(); const allowedSorts=new Set(['relevant','price_asc','size','updated','evidence']); const sort=allowedSorts.has(requestedSort)?requestedSort:'relevant'; const results=sortDiscovery(raw,sort); if(req.query.buyerId)audit('BUYER_SEARCH',req.query.buyerId,{sort:req.query.sort||'relevant',resultCount:results.length}); res.json({query:req.query.q||'',buyerId:req.query.buyerId||null,parsed,sort,results,noResultInsight:results.length?null:'No adequate matching inventory found with the current requirements. Consider changing only the requirement you choose to relax.'}); });
app.post('/api/matching/explain', (req,res) => { const b=buyerProfile(req.body?.buyer||{}); const ids=arr(req.body?.propertyIds); const rows=read('properties').filter(p=>ids.includes(p.id)||ids.includes(p.propertyId)); res.json({buyer:b,explanations:rows.map(p=>({propertyId:p.propertyId||p.id,explanation:matchBuyer(b,p)||{fit:'LOW_FIT',reasons:[],needsConfirmation:['HARD_FILTER']}}))}); });
app.post('/api/compare', (req,res) => { const ids=arr(req.body?.propertyIds); const rows=read('properties').filter(p=>ids.includes(p.id)||ids.includes(p.propertyId)); if(rows.length<2)return res.status(400).json({error:'At least two valid propertyIds are required'}); const out=rows.map(p=>{const ev=read('evidence').filter(e=>e.propertyId===p.id); return {propertyId:p.propertyId||p.id,name:p.name,location:p.location,type:p.propertyType||p.type||null,size:p.size||p.area||null,price:p.price??p.askingPrice??null,evidenceCount:ev.length,evidenceStatus:ev.some(e=>e.status==='CONFLICTING')?'CONFLICTING':ev.length?'AVAILABLE':'NOT_CHECKED',lastUpdated:p.updatedAt||p.createdAt||null};}); if(req.body?.buyerId){ const buyer=read('buyers').find(x=>x.buyerId===req.body.buyerId); if(buyer){ const ar=read('buyer_activity'); ar.push({activityId:id('activity'),buyerId:buyer.buyerId,type:'COMPARE',propertyId:null,metadata:{propertyIds:rows.map(x=>x.id)},createdAt:new Date().toISOString(),principle:'Activity is a signal, not proof of purchase intent.'}); write('buyer_activity',ar.slice(-5000)); audit('BUYER_ACTIVITY_RECORDED',buyer.buyerId,{type:'COMPARE',propertyCount:rows.length}); } } res.json({comparison:out,principle:'Comparison presents recorded facts and evidence coverage; it does not rank or select a winner.'}); });

app.get('/api/properties', (req, res) => res.json(read('properties')));
app.post('/api/properties', (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.location) return res.status(400).json({ error: 'name and location are required' });
  const row = { id: id('prop'), propertyId: `PV-${Date.now()}`, name: String(body.name).trim(), location: String(body.location).trim(), district: body.district || 'Jabalpur', tehsil: body.tehsil || '', khasra: body.khasra || '', coordinates: body.coordinates || null, project: body.project || '', developer: body.developer || '', createdAt: new Date().toISOString() };
  const rows = read('properties'); rows.push(row); write('properties', rows); audit('PROPERTY_CREATED', row.id, { propertyId: row.propertyId }); res.status(201).json(row);
});
app.get('/api/properties/:id', (req, res) => {
  const row = read('properties').find(p => p.id === req.params.id || p.propertyId === req.params.id);
  if (!row) return res.status(404).json({ error: 'Property not found' });
  res.json(row);
});
app.get('/api/properties/:id/evidence', (req, res) => res.json(read('evidence').filter(e => e.propertyId === req.params.id)));
app.get('/api/properties/:id/intelligence', (req,res) => { const r=propertyIntelligence(req.params.id); if(!r) return res.status(404).json({error:'Property not found'}); res.json(r); });
app.get('/api/properties/:id/decision-intelligence', (req,res) => { const r=buildDecisionIntelligence(req.params.id); if(!r) return res.status(404).json({error:'Property not found'}); res.json(r); });
app.get('/api/properties/:id/transaction-readiness', (req,res) => {
  const p = read('properties').find(x => x.id === req.params.id || x.propertyId === req.params.id);
  if (!p) return res.status(404).json({error:'Property not found'});
  const evidence = read('evidence').filter(e => e.propertyId === p.id);
  const documents = read('documents').filter(d => d.propertyId === p.id);
  const gis = read('gis').filter(g => g.propertyId === p.id);
  const di = buildDecisionIntelligence(p.id);
  const ba = buyerDecisionAssistant({property:p,buyer:{},evidence,decisionIntelligence:di});
  res.json(buildTransactionReadiness({property:p,evidence,documents,gis,buyerAssistant:ba,decisionIntelligence:di}));
});

app.post('/api/properties/:id/buyer-assistant', (req,res) => {
  const p = read('properties').find(x => x.id === req.params.id || x.propertyId === req.params.id);
  if (!p) return res.status(404).json({error:'Property not found'});
  const b = req.body || {};
  let buyer = {
    name: b.name || '', purpose: b.purpose || '', budget: b.budget ?? null,
    areas: Array.isArray(b.areas) ? b.areas : [], riskPreference: b.riskPreference || '',
    timeline: b.timeline || '', financing: b.financing || ''
  };
  if (b.userId) {
    const u = read('users').find(x => x.id === b.userId);
    if (!u) return res.status(404).json({error:'User not found'});
    buyer = {...u, ...buyer, purpose: b.purpose || u.purpose, budget: b.budget ?? u.budget, areas: Array.isArray(b.areas) ? b.areas : (u.areas || []), riskPreference: b.riskPreference || u.riskPreference};
  }
  const evidence = read('evidence').filter(e => e.propertyId === p.id);
  const decisionIntel = buildDecisionIntelligence(p.id);
  const result = buyerDecisionAssistant({property:p,buyer,evidence,decisionIntelligence:decisionIntel});
  audit('BUYER_DECISION_ASSISTANT_RUN', p.id, {purpose:result.buyerProfile.purpose, userId:b.userId || null});
  res.json(result);
});

app.post('/api/properties/:id/transaction-readiness', (req,res) => {
  const p = read('properties').find(x => x.id === req.params.id || x.propertyId === req.params.id);
  if (!p) return res.status(404).json({error:'Property not found'});
  const b = req.body || {};
  const evidence = read('evidence').filter(e => e.propertyId === p.id);
  const documents = read('documents').filter(d => d.propertyId === p.id);
  const gis = read('gis').filter(g => g.propertyId === p.id);
  const di = buildDecisionIntelligence(p.id);
  const ba = buyerDecisionAssistant({property:p,buyer:b,evidence,decisionIntelligence:di});
  const result = buildTransactionReadiness({property:p,evidence,documents,gis,buyerAssistant:ba,decisionIntelligence:di});
  audit('TRANSACTION_READINESS_RUN', p.id, {purpose:ba.buyerProfile.purpose, blockerCount:result.readiness.blockerCount});
  res.json(result);
});

app.get('/api/properties/:id/evidence/intelligence', (req,res) => {
  if(!read('properties').some(p=>p.id===req.params.id || p.propertyId===req.params.id)) return res.status(404).json({error:'Property not found'});
  res.json(evidenceIntelligence(req.params.id));
});
app.get('/api/properties/:id/evidence/conflicts', (req,res) => {
  if(!read('properties').some(p=>p.id===req.params.id || p.propertyId===req.params.id)) return res.status(404).json({error:'Property not found'});
  res.json(crossCheckEvidence(req.params.id));
});

app.post('/api/properties/:id/evidence', (req, res) => {
  const props = read('properties');
  if (!props.some(p => p.id === req.params.id)) return res.status(404).json({ error: 'Property not found' });
  const b = req.body || {};
  if (!b.dimension || !b.observation || !b.source) return res.status(400).json({ error: 'dimension, observation and source are required' });
  const status = VALID_STATUS.includes(b.status) ? b.status : 'NOT_CHECKED';
  const confidence = VALID_CONFIDENCE.includes(b.confidence) ? b.confidence : 'UNKNOWN';
  const row = { id: id('ev'), propertyId: req.params.id, dimension: String(b.dimension).toUpperCase(), observation: String(b.observation), source: String(b.source), reference: b.reference || '', observedAt: b.observedAt || new Date().toISOString(), status, confidence, notes: b.notes || '', createdAt: new Date().toISOString() };
  const rows = read('evidence'); rows.push(row); write('evidence', rows); audit('EVIDENCE_ADDED', row.id, { propertyId: req.params.id, dimension: row.dimension, status }); res.status(201).json(row);
});
app.post('/api/properties/:id/verify', (req, res) => {
  const rows = read('evidence');
  const matches = rows.filter(e => e.propertyId === req.params.id);
  if (!matches.length) return res.status(400).json({ error: 'No evidence exists for this property' });
  const result = { verifiedAt: new Date().toISOString(), evidenceCount: matches.length, status: matches.some(e => e.status === 'CONFLICTING') ? 'CONFLICTING' : matches.some(e => e.status === 'UNRESOLVED') ? 'UNRESOLVED' : matches.some(e => e.status === 'PARTIALLY_VERIFIED') ? 'PARTIALLY_VERIFIED' : matches.every(e => e.status === 'VERIFIED') ? 'VERIFIED' : 'NOT_CHECKED' };
  audit('PROPERTY_VERIFIED', req.params.id, result); res.json(result);
});
app.get('/api/properties/:id/assessment', (req, res) => { const a = assessment(req.params.id); if (!a) return res.status(404).json({ error: 'Property not found' }); res.json(a); });

app.get('/api/properties/:id/documents', (req,res) => res.json(read('documents').filter(d => d.propertyId === req.params.id)));
app.post('/api/properties/:id/documents', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id); if(!p) return res.status(404).json({error:'Property not found'});
  const b=req.body||{}; if(!b.name || !b.text) return res.status(400).json({error:'name and text are required'});
  const row={id:id('doc'),propertyId:p.id,name:String(b.name),type:DOC_TYPES.includes(String(b.type||'OTHER').toUpperCase())?String(b.type).toUpperCase():'OTHER',text:String(b.text),source:b.source||'USER_PROVIDED',clauses:detectClauses(String(b.text)),status:'REVIEW_REQUIRED',createdAt:new Date().toISOString()};
  const rows=read('documents'); rows.push(row); write('documents',rows); audit('DOCUMENT_ANALYZED',row.id,{propertyId:p.id,clauseCount:row.clauses.length}); res.status(201).json(row);
});

app.get('/api/properties/:id/gis', (req,res) => res.json(read('gis').filter(g => g.propertyId === req.params.id)));
app.post('/api/properties/:id/gis', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id); if(!p) return res.status(404).json({error:'Property not found'});
  const b=req.body||{}; if(!b.layer || !b.observation) return res.status(400).json({error:'layer and observation are required'});
  const row={id:id('gis'),propertyId:p.id,layer:String(b.layer).toUpperCase(),observation:String(b.observation),source:b.source||'',reference:b.reference||'',observedAt:b.observedAt||new Date().toISOString(),confidence:VALID_CONFIDENCE.includes(b.confidence)?b.confidence:'UNKNOWN',coordinates:b.coordinates||null,distanceKm:b.coordinates&&p.coordinates?haversineKm(p.coordinates,b.coordinates):null,createdAt:new Date().toISOString()};
  const rows=read('gis'); rows.push(row); write('gis',rows); audit('GIS_EVIDENCE_ADDED',row.id,{propertyId:p.id,layer:row.layer}); res.status(201).json(row);
});

app.post('/api/properties/:id/gis/distance', (req,res) => {
  const p=read('properties').find(x=>x.id===req.params.id); if(!p) return res.status(404).json({error:'Property not found'});
  const b=req.body||{}; if(!b.coordinates || p.coordinates==null) return res.status(400).json({error:'Property and target coordinates are required'});
  const distanceKm=haversineKm(p.coordinates,b.coordinates);
  res.json({ provider:'PROPVEDA_GEOMETRY_ADAPTER', authoritative:false, calculation:'HAVERSINE', distanceKm, target:b.label||null,
    note:'Distance is a geometric calculation from supplied coordinates; it is not authoritative land-boundary, road-network, zoning, or ownership evidence.' });
});

app.get('/api/properties/:id/report', (req,res) => { const r=report(req.params.id); if(!r) return res.status(404).json({error:'Property not found'}); res.json(r); });

app.get('/api/properties/:id/audit', (req, res) => res.json(read('audit').filter(a => a.entityId === req.params.id || a.details?.propertyId === req.params.id)));

// CRM + consent layer: stores only user-provided contact data and explicit consent.
function crmEvent(type, entityId, payload = {}) {
  const rows = read('crm_events');
  rows.push({ id:id('crm'), type, entityId, payload, createdAt:new Date().toISOString() });
  write('crm_events', rows.slice(-1000));
}

app.get('/api/crm/users', (req,res) => res.json(read('users')));
app.post('/api/crm/users', (req,res) => {
  const b=req.body||{};
  if(!b.name || !b.contact) return res.status(400).json({error:'name and contact are required'});
  const contact=String(b.contact).trim();
  const rows=read('users');
  const existing=rows.find(u=>u.contact===contact);
  if(existing){ existing.name=String(b.name).trim(); existing.updatedAt=new Date().toISOString(); write('users',rows); crmEvent('CONTACT_UPDATED',existing.id,{contact:existing.contact}); return res.json(existing); }
  const row={id:id('usr'),name:String(b.name).trim(),contact,email:b.email||'',purpose:b.purpose||'',budget:b.budget||null,areas:Array.isArray(b.areas)?b.areas:[],riskPreference:b.riskPreference||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  rows.push(row); write('users',rows); crmEvent('CONTACT_CREATED',row.id,{contact:row.contact}); audit('CRM_CONTACT_CREATED',row.id); res.status(201).json(row);
});

app.post('/api/crm/users/:userId/interests', (req,res) => {
  const user=read('users').find(u=>u.id===req.params.userId); if(!user) return res.status(404).json({error:'User not found'});
  const b=req.body||{}; if(!b.propertyId) return res.status(400).json({error:'propertyId is required'});
  const p=read('properties').find(x=>x.id===b.propertyId || x.propertyId===b.propertyId); if(!p) return res.status(404).json({error:'Property not found'});
  const row={id:id('interest'),userId:user.id,propertyId:p.id,interest:b.interest||'VIEWED',notes:b.notes||'',createdAt:new Date().toISOString()};
  const rows=read('user_property_interest'); rows.push(row); write('user_property_interest',rows); crmEvent('PROPERTY_INTEREST',user.id,{propertyId:p.id,interest:row.interest}); res.status(201).json(row);
});

app.get('/api/crm/users/:userId/interests', (req,res) => res.json(read('user_property_interest').filter(x=>x.userId===req.params.userId)));

app.post('/api/consents', (req,res) => {
  const b=req.body||{}; if(!b.userId || !b.purpose || b.granted !== true) return res.status(400).json({error:'userId, purpose and granted=true are required'});
  if(!read('users').some(u=>u.id===b.userId)) return res.status(404).json({error:'User not found'});
  const row={id:id('consent'),userId:b.userId,purpose:String(b.purpose),granted:true,channel:b.channel||'WEB',policyVersion:b.policyVersion||'1.0',grantedAt:new Date().toISOString(),withdrawnAt:null};
  const rows=read('consents'); rows.push(row); write('consents',rows); crmEvent('CONSENT_GRANTED',row.userId,{purpose:row.purpose,channel:row.channel}); audit('CONSENT_GRANTED',row.userId,{purpose:row.purpose}); res.status(201).json(row);
});
app.post('/api/consents/:id/withdraw', (req,res) => {
  const rows=read('consents'); const row=rows.find(x=>x.id===req.params.id); if(!row) return res.status(404).json({error:'Consent not found'});
  row.withdrawnAt=new Date().toISOString(); write('consents',rows); crmEvent('CONSENT_WITHDRAWN',row.userId,{consentId:row.id,purpose:row.purpose}); audit('CONSENT_WITHDRAWN',row.userId,{consentId:row.id}); res.json(row);
});

app.post('/api/properties/:id/report/save', (req,res) => {
  const r=report(req.params.id); if(!r) return res.status(404).json({error:'Property not found'});
  const prior=read('reports').filter(x=>x.property?.id===req.params.id); const row={...r,version:prior.length+1,status:'GENERATED',delivery:'IN_APP',createdAt:new Date().toISOString()};
  const rows=read('reports'); rows.push(row); write('reports',rows); audit('REPORT_GENERATED',req.params.id,{reportId:row.reportId}); crmEvent('REPORT_GENERATED',req.params.id,{reportId:row.reportId}); res.status(201).json(row);
});
app.get('/api/reports/:reportId', (req,res) => { const row=read('reports').find(x=>x.reportId===req.params.reportId || x.id===req.params.reportId); if(!row) return res.status(404).json({error:'Report not found'}); res.json(row); });

app.post('/api/consultations', (req,res) => {
  const b=req.body||{}; if(!b.userId || !b.propertyId) return res.status(400).json({error:'userId and propertyId are required'});
  if(!read('users').some(u=>u.id===b.userId)) return res.status(404).json({error:'User not found'});
  if(!read('properties').some(p=>p.id===b.propertyId)) return res.status(404).json({error:'Property not found'});
  const row={id:id('consult'),userId:b.userId,propertyId:b.propertyId,mode:b.mode||'CALLBACK',message:b.message||'',status:'REQUESTED',createdAt:new Date().toISOString()};
  const rows=read('consultations'); rows.push(row); write('consultations',rows); crmEvent('CONSULTATION_REQUESTED',row.id,{userId:row.userId,propertyId:row.propertyId}); audit('CONSULTATION_REQUESTED',row.id,{userId:row.userId,propertyId:row.propertyId}); res.status(201).json(row);
});
app.get('/api/consultations', (req,res) => res.json(read('consultations')));
app.get('/api/automation/queue', (req,res) => {
  const reports=read('reports').filter(x=>x.status==='GENERATED').map(x=>({type:'REPORT_READY',id:x.reportId,propertyId:x.property.id,channel:x.delivery}));
  const consults=read('consultations').filter(x=>x.status==='REQUESTED').map(x=>({type:'CONSULTATION_FOLLOW_UP',id:x.id,propertyId:x.propertyId,userId:x.userId}));
  res.json({generatedAt:new Date().toISOString(),items:[...reports,...consults]});
});
app.get('/api/crm/events', (req,res) => res.json(read('crm_events').slice(-200).reverse()));


app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });
app.get('*', (req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));
app.listen(PORT, () => console.log(`PropVeda AI MVP running on ${PORT}`));
