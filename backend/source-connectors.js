const { getSource } = require('./source-registry');

const AUTHORIZED_ENDPOINTS = {
  MP_BHULEKH: process.env.MP_BHULEKH_API_URL || '',
  MP_SAMPADA: process.env.MP_SAMPADA_API_URL || '',
  MP_RERA: process.env.MP_RERA_API_URL || '',
  MP_TOWN_COUNTRY_PLANNING: process.env.MP_TOWN_COUNTRY_PLANNING_API_URL || ''
};

async function authorizedFetch(endpoint, lookup) {
  const url = new URL(endpoint);
  Object.entries(lookup || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) url.searchParams.set(key, String(value).trim());
  });
  const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch (_) { data = { raw: text.slice(0, 50000) }; }
  return { ok: response.ok, status: response.status, url: url.toString(), data };
}

const CONNECTORS = {
  MP_BHULEKH: {
    mode: 'MANUAL_OR_AUTHORIZED',
    execute: async ({ property }) => {
      const lookup = {
        district: property.district || 'Jabalpur',
        tehsil: property.tehsil || '',
        village: property.village || '',
        khasra: property.khasra || '',
        location: property.location || ''
      };
      if (!AUTHORIZED_ENDPOINTS.MP_BHULEKH) return {
        status: 'MANUAL_REQUIRED', sourceKey: 'MP_BHULEKH', propertyId: property.id,
        automatedFetch: false, endpointConfigured: false, lookup,
        requiredEvidence: ['recordType','district','tehsil','village','khasra','reference'],
        message: 'Authorized access is not configured. Use the official source manually and ingest the observed record as evidence.'
      };
      try {
        const result = await authorizedFetch(AUTHORIZED_ENDPOINTS.MP_BHULEKH, lookup);
        return { status: result.ok ? 'FETCHED' : 'FETCH_FAILED', sourceKey: 'MP_BHULEKH', propertyId: property.id,
          automatedFetch: true, endpointConfigured: true, lookup, httpStatus: result.status,
          response: result.data, fetchedAt: new Date().toISOString(), reference: result.url,
          message: result.ok ? 'Authorized source response received; verify response mapping before treating fields as evidence.' : 'Authorized source request returned an error.' };
      } catch (error) {
        return { status: 'FETCH_ERROR', sourceKey: 'MP_BHULEKH', propertyId: property.id, automatedFetch: true,
          endpointConfigured: true, lookup, error: error.message, fetchedAt: new Date().toISOString() };
      }
    }
  },

  MP_SAMPADA: {
    mode: 'MANUAL_OR_AUTHORIZED',
    execute: ({ property }) => ({ status: AUTHORIZED_ENDPOINTS.MP_SAMPADA ? 'AUTHORIZED_READY' : 'MANUAL_REQUIRED', sourceKey:'MP_SAMPADA', propertyId:property.id, automatedFetch:Boolean(AUTHORIZED_ENDPOINTS.MP_SAMPADA), endpointConfigured:Boolean(AUTHORIZED_ENDPOINTS.MP_SAMPADA), lookup:{ location:property.location||'', district:property.district||'Jabalpur', registrationReference:property.registrationNumber||'' }, requiredEvidence:['registrationNumber','documentType','registrationDate','reference'] })
  },
  MP_RERA: {
    mode: 'MANUAL_OR_AUTHORIZED',
    execute: ({ property }) => ({ status: AUTHORIZED_ENDPOINTS.MP_RERA ? 'AUTHORIZED_READY' : 'MANUAL_REQUIRED', sourceKey:'MP_RERA', propertyId:property.id, automatedFetch:Boolean(AUTHORIZED_ENDPOINTS.MP_RERA), endpointConfigured:Boolean(AUTHORIZED_ENDPOINTS.MP_RERA), lookup:{ project:property.project||'', developer:property.developer||'', location:property.location||'' }, requiredEvidence:['registrationNumber','projectName','reference'] })
  },
  MP_TOWN_COUNTRY_PLANNING: {
    mode: 'PUBLIC_DOCUMENT',
    execute: ({ property }) => ({ status: AUTHORIZED_ENDPOINTS.MP_TOWN_COUNTRY_PLANNING ? 'AUTHORIZED_READY' : 'DOCUMENT_REVIEW_REQUIRED', sourceKey:'MP_TOWN_COUNTRY_PLANNING', propertyId:property.id, automatedFetch:Boolean(AUTHORIZED_ENDPOINTS.MP_TOWN_COUNTRY_PLANNING), endpointConfigured:Boolean(AUTHORIZED_ENDPOINTS.MP_TOWN_COUNTRY_PLANNING), lookup:{ location:property.location||'', district:property.district||'Jabalpur', khasra:property.khasra||'' }, requiredEvidence:['planName','publicationDate','page','reference'] })
  }
};

function connectorStatus() {
  return Object.entries(CONNECTORS).map(([key, connector]) => ({ key, registered:true, mode:connector.mode, source:getSource(key)?.name||key, automatedFetch:Boolean(AUTHORIZED_ENDPOINTS[key]), endpointConfigured:Boolean(AUTHORIZED_ENDPOINTS[key]), status:AUTHORIZED_ENDPOINTS[key]?'AUTHORIZED_READY':'SCAFFOLD_READY' }));
}
function runConnector(sourceKey, property={}) {
  const key=String(sourceKey||'').toUpperCase(); const source=getSource(key); const connector=CONNECTORS[key];
  if(!source||!connector) return {ok:false,error:'Connector not registered'};
  return Promise.resolve(connector.execute({property})).then(connectorResult=>({ok:true,source:{key:source.key,name:source.name,authority:source.authority},connector:connectorResult}));
}
function connectorReadiness() {
  const statuses=connectorStatus();
  return { generatedAt:new Date().toISOString(), total:statuses.length, registered:statuses.length, authorizedReady:statuses.filter(x=>x.status==='AUTHORIZED_READY').length, automatedFetch:statuses.filter(x=>x.automatedFetch).length, manualFallback:statuses.filter(x=>!x.automatedFetch).length, productionReady:false, note:'AUTHORIZED_READY means an endpoint is configured. Runtime verification and authorization validation are still required before production use.', connectors:statuses };
}
module.exports={connectorStatus,connectorReadiness,runConnector};