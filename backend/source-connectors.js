const { getSource } = require('./source-registry');

const AUTHORIZED_ENDPOINTS = {
  MP_BHULEKH: process.env.MP_BHULEKH_API_URL || '',
  MP_SAMPADA: process.env.MP_SAMPADA_API_URL || '',
  MP_RERA: process.env.MP_RERA_API_URL || '',
  MP_TOWN_COUNTRY_PLANNING: process.env.MP_TOWN_COUNTRY_PLANNING_API_URL || ''
};

function bhulekhIds(property = {}) {
  return {
    distId: property.dist_id || property.distId || '',
    tehId: property.teh_id || property.tehId || '',
    lgdCode: property.lgdcode || property.lgdCode || property.villageLgdCode || '',
    khasraId: property.khasraId || property.khasra_id || '',
    lang: property.lang || 1
  };
}

function buildBhulekhCopyReference(property = {}, type = 'KHASRA') {
  const { distId, tehId, lgdCode, khasraId, lang } = bhulekhIds(property);
  const missing = [
    !distId ? 'dist_id' : null,
    !tehId ? 'teh_id' : null,
    !lgdCode ? 'lgdcode' : null,
    !khasraId ? 'khasraId' : null
  ].filter(Boolean);

  if (missing.length) {
    return {
      ready: false,
      type,
      url: 'https://webgis2.mpbhulekh.gov.in',
      mode: 'CITIZEN_SEARCH',
      missing
    };
  }

  const path = type === 'KHATONI' ? 'getKhatoniCopyView' : 'getKhasraCopyView';
  const query = new URLSearchParams({
    dist_id: String(distId), teh_id: String(tehId), lgdcode: String(lgdCode),
    khasraId: String(khasraId), lang: String(lang)
  });

  return {
    ready: true, type,
    mode: type === 'KHATONI' ? 'PUBLIC_KHATONI_COPY' : 'PUBLIC_KHASRA_COPY',
    url: `https://mpbhulekh.gov.in:8092/UniSearch/${path}?${query.toString()}`,
    fields: { dist_id: distId, teh_id: tehId, lgdcode: lgdCode, khasraId, lang }
  };
}

function buildSampadaCitizenLookup(property = {}) {
  const registrationNumber = property.registrationNumber || property.registration_number || '';
  const documentType = property.documentType || property.document_type || '';
  const registrationDate = property.registrationDate || property.registration_date || '';
  const district = property.district || 'Jabalpur';
  const location = property.location || '';
  return {
    portal: 'https://sampada.mpigr.gov.in',
    mode: 'CITIZEN_SEARCH_OR_AUTHORIZED_API',
    ready: Boolean(registrationNumber || documentType || location),
    lookup: { district, location, registrationNumber, documentType, registrationDate },
    requiredForEvidence: ['registrationNumber','documentType','registrationDate','reference'],
    apiContract: {
      channel: 'API_SETU',
      contract: 'PROPERTY_DETAILS_API',
      credentialsRequired: true,
      endpoint: AUTHORIZED_ENDPOINTS.MP_SAMPADA || null
    },
    note: AUTHORIZED_ENDPOINTS.MP_SAMPADA
      ? 'Authorized endpoint configured; runtime verification is required.'
      : 'Use the official SAMPADA citizen portal for the record search, then ingest the observed registration record. Automated API access remains authorization-dependent.'
  };
}

const CONNECTORS = {
  MP_BHULEKH: {
    mode: 'PUBLIC_CITIZEN_SEARCH_OR_AUTHORIZED',
    execute: ({ property }) => {
      const khasraReference = buildBhulekhCopyReference(property, 'KHASRA');
      const khatoniReference = buildBhulekhCopyReference(property, 'KHATONI');
      return {
        status: AUTHORIZED_ENDPOINTS.MP_BHULEKH ? 'AUTHORIZED_READY' : khasraReference.ready ? 'PUBLIC_REFERENCE_READY' : 'CITIZEN_SEARCH_REQUIRED',
        sourceKey: 'MP_BHULEKH', propertyId: property.id,
        automatedFetch: Boolean(AUTHORIZED_ENDPOINTS.MP_BHULEKH),
        endpointConfigured: Boolean(AUTHORIZED_ENDPOINTS.MP_BHULEKH),
        lookup: { district: property.district || 'Jabalpur', tehsil: property.tehsil || '', village: property.village || '', khasra: property.khasra || '', location: property.location || '', ...bhulekhIds(property) },
        publicCitizenRoute: { webgis: 'https://webgis2.mpbhulekh.gov.in', khasra: khasraReference, khatoni: khatoniReference },
        requiredEvidence: ['recordType','district','tehsil','village','khasra','reference'],
        message: AUTHORIZED_ENDPOINTS.MP_BHULEKH
          ? 'Authorized endpoint configured. Runtime verification is required before production use.'
          : khasraReference.ready
            ? 'Verified public Khasra and Khatoni copy routes constructed from official MP Bhulekh identifiers.'
            : 'Use the official WebGIS 2.0 citizen search to resolve district, tehsil, village and Khasra identifiers first.'
      };
    }
  },

  MP_SAMPADA: {
    mode: 'CITIZEN_SEARCH_OR_AUTHORIZED_API',
    execute: ({ property }) => {
      const citizenLookup = buildSampadaCitizenLookup(property);
      return {
        status: AUTHORIZED_ENDPOINTS.MP_SAMPADA ? 'AUTHORIZED_READY' : citizenLookup.ready ? 'CITIZEN_LOOKUP_READY' : 'CITIZEN_INPUT_REQUIRED',
        sourceKey: 'MP_SAMPADA',
        propertyId: property.id,
        automatedFetch: Boolean(AUTHORIZED_ENDPOINTS.MP_SAMPADA),
        endpointConfigured: Boolean(AUTHORIZED_ENDPOINTS.MP_SAMPADA),
        citizenRoute: citizenLookup,
        requiredEvidence: citizenLookup.requiredForEvidence,
        message: citizenLookup.note
      };
    }
  },

  MP_RERA: {
    mode: 'MANUAL_OR_AUTHORIZED',
    execute: ({ property }) => ({
      status: AUTHORIZED_ENDPOINTS.MP_RERA ? 'AUTHORIZED_READY' : 'MANUAL_REQUIRED',
      sourceKey: 'MP_RERA', propertyId: property.id,
      automatedFetch: Boolean(AUTHORIZED_ENDPOINTS.MP_RERA),
      endpointConfigured: Boolean(AUTHORIZED_ENDPOINTS.MP_RERA),
      lookup: { project: property.project || '', developer: property.developer || '', location: property.location || '' },
      requiredEvidence: ['registrationNumber','projectName','reference'],
      message: AUTHORIZED_ENDPOINTS.MP_RERA
        ? 'Authorized endpoint configured. Runtime verification is required before production use.'
        : 'Use the authority record manually and ingest only the observed record with its reference.'
    })
  },

  MP_TOWN_COUNTRY_PLANNING: {
    mode: 'PUBLIC_DOCUMENT',
    execute: ({ property }) => ({
      status: AUTHORIZED_ENDPOINTS.MP_TOWN_COUNTRY_PLANNING ? 'AUTHORIZED_READY' : 'DOCUMENT_REVIEW_REQUIRED',
      sourceKey: 'MP_TOWN_COUNTRY_PLANNING', propertyId: property.id,
      automatedFetch: Boolean(AUTHORIZED_ENDPOINTS.MP_TOWN_COUNTRY_PLANNING),
      endpointConfigured: Boolean(AUTHORIZED_ENDPOINTS.MP_TOWN_COUNTRY_PLANNING),
      lookup: { location: property.location || '', district: property.district || 'Jabalpur', khasra: property.khasra || '' },
      requiredEvidence: ['planName','publicationDate','page','reference'],
      message: AUTHORIZED_ENDPOINTS.MP_TOWN_COUNTRY_PLANNING
        ? 'Authorized document endpoint configured. Runtime verification is required before production use.'
        : 'Review the applicable official planning document/map and ingest only observed evidence with document reference and date.'
    })
  }
};

function connectorStatus() {
  return Object.entries(CONNECTORS).map(([key, connector]) => {
    const endpointConfigured = Boolean(AUTHORIZED_ENDPOINTS[key]);
    return {
      key, registered: true, mode: connector.mode, source: getSource(key)?.name || key,
      automatedFetch: endpointConfigured, endpointConfigured,
      status: key === 'MP_BHULEKH' && !endpointConfigured
        ? 'PUBLIC_CITIZEN_ROUTE_AVAILABLE'
        : endpointConfigured ? 'AUTHORIZED_READY' : key === 'MP_SAMPADA' ? 'CITIZEN_SEARCH_AVAILABLE' : 'SCAFFOLD_READY'
    };
  });
}

function runConnector(sourceKey, property = {}) {
  const key = String(sourceKey || '').toUpperCase();
  const source = getSource(key), connector = CONNECTORS[key];
  if (!source || !connector) return { ok: false, error: 'Connector not registered' };
  return { ok: true, source: { key: source.key, name: source.name, authority: source.authority }, connector: connector.execute({ property }) };
}

function connectorReadiness() {
  const statuses = connectorStatus();
  return {
    generatedAt: new Date().toISOString(), total: statuses.length,
    registered: statuses.filter(x => x.registered).length,
    authorizedReady: statuses.filter(x => x.status === 'AUTHORIZED_READY').length,
    automatedFetch: statuses.filter(x => x.automatedFetch).length,
    publicCitizenRoutes: statuses.filter(x => ['PUBLIC_CITIZEN_ROUTE_AVAILABLE','CITIZEN_SEARCH_AVAILABLE'].includes(x.status)).length,
    manualFallback: statuses.filter(x => !x.automatedFetch).length,
    productionReady: false,
    note: 'Public citizen routes are exposed only where the official route is verified. Automated government access still requires authorized runtime integration.',
    connectors: statuses
  };
}

module.exports = { connectorStatus, connectorReadiness, runConnector, buildBhulekhCopyReference, buildSampadaCitizenLookup };
