// CI smoke verification
const fs=require('fs'); const path=require('path'); const base=__dirname; const read=n=>fs.readFileSync(path.join(base,n),'utf8');
const server=read('server.js'); const workflow=read('verification-workflow.js'); const front=fs.readFileSync(path.join(base,'..','frontend','index.html'),'utf8');
const required=[
 ['verification workflow module',workflow.includes('buildVerificationCase')&&workflow.includes('buildWorkspace')],
 ['verification lifecycle',workflow.includes('OPEN')&&workflow.includes('IN_REVIEW')&&workflow.includes('VERIFIED')&&workflow.includes('CONFLICT')],
 ['verification result states',workflow.includes('PARTIALLY_VERIFIED')&&workflow.includes('UNVERIFIED')],
 ['source linked cases',workflow.includes('sourceReference')&&workflow.includes('evidenceIds')],
 ['verification events',workflow.includes('VERIFICATION_RESULT_RECORDED')&&server.includes('CASE_REVIEW_STARTED')&&workflow.includes('CASE_CREATED')],
 ['reassessment flag',workflow.includes('reassessmentRequired')],
 ['no evidence rule',workflow.includes('NO EVIDENCE ≠ NEGATIVE EVIDENCE')],
 ['workflow imported',server.includes("require('./verification-workflow')")],
 ['workflow health module',server.includes('verification_case_workspace')],
 ['workspace endpoint',server.includes('/api/properties/:id/verification-workspace')],
 ['case create endpoint',server.includes('/api/properties/:id/verification-cases')],
 ['case start endpoint',server.includes('/verification-cases/:caseId/start')],
 ['case result endpoint',server.includes('/verification-cases/:caseId/result')],
 ['case detail endpoint',server.includes('/verification-cases/:caseId')],
 ['case persistence',server.includes('verification_cases.json')&&server.includes("ensureDataFile('verification_cases')")],
 ['report workspace',server.includes('verificationWorkspace')],
 ['audit case creation',server.includes('VERIFICATION_CASE_CREATED')],
 ['audit verification result',server.includes('VERIFICATION_RESULT_RECORDED')],
 ['frontend workspace panel',front.includes('Human Review Workspace')&&front.includes('Verification Workflow')],
 ['frontend workspace loader',front.includes('loadVerificationWorkspace()')&&front.includes('/verification-workspace')]
,
['buyer data layer',server.includes("buyers.json")&&server.includes("ensureDataFile('buyers')")],
['natural language discovery parser',server.includes('parseBuyerQuery')&&server.includes('/api/buyers/query')],
['discovery endpoint',server.includes("app.get('/api/discovery'")],
['matching explain endpoint',server.includes("app.post('/api/matching/explain'")],
['compare endpoint',server.includes("app.post('/api/compare'")],
['buyer activity routes',server.includes("/api/buyers/:buyerId/activity")&&server.includes('BUYER_ACTIVITY_RECORDED')],
['discovery sorting',server.includes('sortDiscovery')&&server.includes("price_asc")&&server.includes("evidence")],
['buyerId discovery',server.includes('req.query.buyerId')&&server.includes('Buyer not found')],
['frontend discovery UI',front.includes('AI Property Discovery')&&front.includes('runDiscovery()')],
['frontend compare UI',front.includes('Compare Properties')&&front.includes('updateCompareSelection()')]

]; let pass=0; for(const [n,ok] of required){console.log(`${ok?'PASS':'FAIL'}: ${n}`); if(ok)pass++;} console.log(`PropVeda v1.4.1 static smoke test: ${pass}/${required.length} PASS`); if(pass!==required.length)process.exit(1);

['source registry runtime readiness',read('source-registry.js').includes('runtimePublicFetch')&&read('source-registry.js').includes('RUNTIME_PUBLIC_FETCH_READY')],
['connector runtime readiness',read('source-connectors.js').includes('runtimePublicFetch')&&read('source-connectors.js').includes('RUNTIME_PUBLIC_FETCH_READY')],
['ABPAS runtime fetch',read('source-connectors.js').includes('fetchAbpasLayoutRuntime')&&read('source-connectors.js').includes('PUBLIC_HTML_RUNTIME_FETCH')],
['runtime ingest endpoint',server.includes('/source-check/:key/ingest')&&server.includes('SOURCE_EVIDENCE_INGESTED')],

// ABPAS runtime evidence ingest verification
