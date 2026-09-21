const { getSource } = require('./source-registry');

const AUTHORIZED_ENDPOINTS = {
  MP_BHULEKH: process.env.MP_BHULEKH_API_URL || '',
  MP_SAMPADA: process.env.MP_SAMPADA_API_URL || '',
  MP_RERA: process.env.MP_RERA_API_URL || '',
  MP_TOWN_COUNTRY_PLANNING: process.env.MP_TOWN_COUNTRY_PLANNING_API_URL || ''
};

function buildBhulekhKhasraReference(property = {}) {
  const distId = property.dist_id || property.distId || '';
  const tehId = property.teh_id || property.tehId || '';
  const lgdCode = property.lgdcode || property.lgdCode || property.villageLgdCode || '';
  const khasraId = property.khasraId || property.khasra_id || '';

  if (!distId || !tehId || !lgdCode || !khasraId) {
    return {
      ready: false,
      url: 'https://webgis2.mpbhulekh.gov.in',
      mode: 'CITIZEN_SEARCH',
      missing: [
        !distId ? 'dist_id' : null,
        !tehId ? 'teh_id' : null,
        !lgdCode ? 'lgdcode' : null,
        !khasraId ? 'khasraId' : null
      ].filter(Boolean)
    };
  }

  const query = new URLSearchParams({
    dist_id: String(distId),
    teh_id: String(tehId),
    lgdcode: String(lgdCode),
    khasraId: String(khasraId),
    lang: String(property.lang || 1)
  });

  return {
    ready: true,
    mode: 'PUBLIC_KHASRA_COPY',
    url: `https://mpbhulekh.gov.in:8092/UniSearch/getKhasraCopyView?${query.toString()}`,
    fields: { dist_id: distId, teh_id: tehId, lgdcode: lgdCode, khasraId, lang: property.lang || 1 }
  };
}

const CONNECTORS = {
  MP_BHULEKH: {
    mode: 'PUBLIC_CITIZEN_SEARCH_OR_AUTHORIZED',
    execute: ({ property }) => {
      const bhulekhReference = buildBhulekhKhasraReference(property);

      return {
        status: AUTHORIZED_ENDPOINTS.MP_BHULEKH
          ? 'AUTHORIZED_READY'
          : bhulekhReference.ready
            ? 'PUBLIC_REFERENCE_READY'
            : 'CITIZEN_SEARCH_REQUIRED',
        sourceKey: 'MP_BHULEKH',
        propertyId: property.id,
        automatedFetch: Boolean(AUTHORIZED_ENDPOINTS.MP_BHULEKH),
        endpointConfigured: Boolean(AUTHORIZED_ENDPOINTS.MP_BHULEKH),
        lookup: {
          district: property.district || 'Jabalpur',
          tehsil: property.tehsil || '',
          village: property.village || '',
          khasra: property.khasra || '',
          location: property.location || '',
          dist_id: property.dist_id || property.distId || '',
          teh_id: property.teh_id || property.tehId || '',
          lgdcode: property.lgdcode || property.lgdCode || property.villageLgdCode || '',
          khasraId: property.khasraId || property.khasra_id || ''
        },
        publicCitizenRoute: bhulekhReference,
        requiredEvidence: [
          'recordType',
          'district',
          'tehsil',
          'village',
          'khasra',
          'reference'
        ],
        message: AUTHORIZED_ENDPOINTS.MP_BHULEKH
          ? 'Authorized endpoint configured. Runtime verification is required before production use.'
          : bhulekhReference.ready
            ? 'Verified public Khasra-copy route constructed from official MP Bhulekh identifiers.'
            : 'Use the official WebGIS 2.0 citizen search to resolve district, tehsil, village and Khasra identifiers first.'
      };
    }
  },

  MP_SAMPADA: {
    mode: 'MANUAL_OR_AUTHORIZED',
    execute: ({ property }) => ({
      status: AUTHORIZED_ENDPOINTS.MP_SAMPADA ? 'AUTHORIZED_READY' : 'MANUAL_REQUIRED',
      sourceKey: 'MP_SAMPADA',
      propertyId: property.id,
      automatedFetch: Boolean(AUTHORIZED_ENDPOINTS.MP_SAMPADA),
      endpointConfigured: Boolean(AUTHORIZED_ENDPOINTS.MP_SAMPADA),
      lookup: {
        location: property.location || '',
        district: property.district || 'Jabalpur',
        registrationReference: property.registrationNumber || ''
      },
      requiredEvidence: [
        'registrationNumber',
        'documentType',
        'registrationDate',
        'reference'
      ],
      message: AUTHORIZED_ENDPOINTS.MP_SAMPADA
        ? 'Authorized endpoint configured. Runtime verification is required before production use.'
        : 'Authorized registration access is not configured. No automated scraping is enabled.'
    })
  },

  MP_RERA: {
    mode: 'MANUAL_OR_AUTHORIZED',
    execute: ({ property }) => ({
      status: AUTHORIZED_ENDPOINTS.MP_RERA ? 'AUTHORIZED_READY' : 'MANUAL_REQUIRED',
      sourceKey: 'MP_RERA',
      propertyId: property.id,
      automatedFetch: Boolean(AUTHORIZED_ENDPOINTS.MP_RERA),
      endpointConfigured: Boolean(AUTHORIZED_ENDPOINTS.MP_RERA),
      lookup: {
        project: property.project || '',
        developer: property.developer || '',
        location: property.location || ''
      },
      requiredEvidence: [
        'registrationNumber',
        'projectName',
        'reference'
      ],
      message: AUTHORIZED_ENDPOINTS.MP_RERA
        ? 'Authorized endpoint configured. Runtime verification is required before production use.'
        : 'Use the authority record manually and ingest only the observed record with its reference.'
    })
  },

  MP_TOWN_COUNTRY_PLANNING: {
    mode: 'PUBLIC_DOCUMENT',
    execute: ({ property }) => ({
      status: AUTHORIZED_ENDPOINTS.MP_TOWN_COUNTRY_PLANNING
        ? 'AUTHORIZED_READY'
        : 'DOCUMENT_REVIEW_REQUIRED',
      sourceKey: 'MP_TOWN_COUNTRY_PLANNING',
      propertyId: property.id,
      automatedFetch: Boolean(AUTHORIZED_ENDPOINTS.MP_TOWN_COUNTRY_PLANNING),
      endpointConfigured: Boolean(AUTHORIZED_ENDPOINTS.MP_TOWN_COUNTRY_PLANNING),
      lookup: {
        location: property.location || '',
        district: property.district || 'Jabalpur',
        khasra: property.khasra || ''
      },
      requiredEvidence: [
        'planName',
        'publicationDate',
        'page',
        'reference'
      ],
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
      key,
      registered: true,
      mode: connector.mode,
      source: getSource(key)?.name || key,
      automatedFetch: endpointConfigured,
      endpointConfigured,
      status: key === 'MP_BHULEKH' && !endpointConfigured
        ? 'PUBLIC_CITIZEN_ROUTE_AVAILABLE'
        : endpointConfigured
          ? 'AUTHORIZED_READY'
          : 'SCAFFOLD_READY'
    };
  });
}

function runConnector(sourceKey, property = {}) {
  const key = String(sourceKey || '').toUpperCase();
  const source = getSource(key);
  const connector = CONNECTORS[key];

  if (!source || !connector) {
    return {
      ok: false,
      error: 'Connector not registered'
    };
  }

  return {
    ok: true,
    source: {
      key: source.key,
      name: source.name,
      authority: source.authority
    },
    connector: connector.execute({ property })
  };
}

function connectorReadiness() {
  const statuses = connectorStatus();

  return {
    generatedAt: new Date().toISOString(),
    total: statuses.length,
    registered: statuses.filter(x => x.registered).length,
    authorizedReady: statuses.filter(x => x.status === 'AUTHORIZED_READY').length,
    automatedFetch: statuses.filter(x => x.automatedFetch).length,
    publicCitizenRoutes: statuses.filter(x => x.status === 'PUBLIC_CITIZEN_ROUTE_AVAILABLE').length,
    manualFallback: statuses.filter(x => !x.automatedFetch).length,
    productionReady: false,
    note: 'Public citizen routes are exposed only where the official route is verified. Automated government access still requires authorized runtime integration.',
    connectors: statuses
  };
}

module.exports = {
  connectorStatus,
  connectorReadiness,
  runConnector,
  buildBhulekhKhasraReference
};
