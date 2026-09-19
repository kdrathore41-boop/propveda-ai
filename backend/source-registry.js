const SOURCES = [
  {
    key: 'MP_BHULEKH', name: 'MP Bhulekh', authority: 'Commissioner Land Records, Government of Madhya Pradesh',
    baseUrl: 'https://mpbhulekh.gov.in', dataTypes: ['LAND_RECORD','KHASRA','KHATAUNI','MAP','REVENUE_COURT'],
    dimensions: ['TITLE','LEGAL','PLANNING'], accessMethod: 'MANUAL_OR_AUTHORIZED_INTEGRATION', freshnessPolicy: 'CHECK_SOURCE_DATE',
    referenceFields: ['recordType','district','tehsil','village','khasra','reference'], enabled: true, liveApi: false,
    notes: 'Official land-record portal. This MVP does not claim an API or automated access.'
  },
  {
    key: 'MP_SAMPADA', name: 'SAMPADA / Registration & Stamps', authority: 'Registration & Stamps Department, Government of Madhya Pradesh',
    baseUrl: 'https://sampada.mpigr.gov.in', dataTypes: ['REGISTERED_DEED','E_REGISTRATION','STAMP','GUIDELINE_VALUE'],
    dimensions: ['TITLE','FINANCIAL','DOCUMENT'], accessMethod: 'MANUAL_OR_AUTHORIZED_INTEGRATION', freshnessPolicy: 'CHECK_REGISTRATION_DATE',
    referenceFields: ['registrationNumber','documentType','registrationDate','reference'], enabled: true, liveApi: false,
    notes: 'Registration source registry only; no automated scraping is enabled.'
  },
  {
    key: 'MP_RERA', name: 'Madhya Pradesh RERA', authority: 'Madhya Pradesh Real Estate Regulatory Authority',
    baseUrl: 'http://rera.mp.gov.in', dataTypes: ['PROJECT','REGISTRATION','COMPLAINT','ORDER'],
    dimensions: ['PROJECT','LEGAL','DOCUMENT'], accessMethod: 'MANUAL_OR_AUTHORIZED_INTEGRATION', freshnessPolicy: 'CHECK_RECORD_DATE',
    referenceFields: ['registrationNumber','projectName','reference'], enabled: true, liveApi: false,
    notes: 'Official authority registry reference; automated access is not asserted.'
  },
  {
    key: 'MP_TOWN_COUNTRY_PLANNING', name: 'MP Town & Country Planning', authority: 'Directorate of Town & Country Planning, Madhya Pradesh',
    baseUrl: 'https://www.mptownplan.gov.in', dataTypes: ['DEVELOPMENT_PLAN','LAND_USE','PLANNING_MAP'],
    dimensions: ['PLANNING','INFRASTRUCTURE'], accessMethod: 'PUBLIC_WEB_DOCUMENT', freshnessPolicy: 'CHECK_PLAN_DATE',
    referenceFields: ['planName','publicationDate','page','reference'], enabled: true, liveApi: false,
    notes: 'Planning documents/maps must be attached as evidence with their publication/reference details.'
  }
];

function listSources(){ return SOURCES.map(x => ({...x})); }
function getSource(key){ return SOURCES.find(x => x.key === String(key).toUpperCase()) || null; }
function health(){ return SOURCES.map(x => ({ key:x.key, enabled:x.enabled, liveApi:x.liveApi, accessMethod:x.accessMethod, status:x.liveApi ? 'READY' : 'SCAFFOLD_MANUAL', baseUrl:x.baseUrl })); }
function readiness(){ return { total:SOURCES.length, enabled:SOURCES.filter(x=>x.enabled).length, liveApi:SOURCES.filter(x=>x.liveApi).length, manual:SOURCES.filter(x=>x.enabled && !x.liveApi).length, productionReady:SOURCES.some(x=>x.liveApi), note:'A source is production-ready only when authorized access and runtime verification are implemented.' }; }
module.exports = { listSources, getSource, health, readiness };
