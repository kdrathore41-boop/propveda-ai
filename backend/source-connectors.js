const { getSource } = require('./source-registry');

const CONNECTORS = {
  MP_BHULEKH: {
    mode: 'MANUAL_OR_AUTHORIZED',
    execute: ({ property }) => ({
      status: 'MANUAL_REQUIRED',
      sourceKey: 'MP_BHULEKH',
      propertyId: property.id,
      lookup: { district: property.district || 'Jabalpur', tehsil: property.tehsil || '', khasra: property.khasra || '', location: property.location },
      requiredEvidence: ['recordType', 'district', 'tehsil', 'village', 'khasra', 'reference'],
      message: 'Open the authorized source, perform the property lookup, and ingest the resulting record as evidence. No automated access is claimed by this connector.'
    })
  },
  MP_SAMPADA: {
    mode: 'MANUAL_OR_AUTHORIZED',
    execute: ({ property }) => ({
      status: 'MANUAL_REQUIRED', sourceKey: 'MP_SAMPADA', propertyId: property.id,
      lookup: { location: property.location, district: property.district || 'Jabalpur', registrationReference: property.registrationNumber || '' },
      requiredEvidence: ['registrationNumber', 'documentType', 'registrationDate', 'reference'],
      message: 'Use an authorized registration/document lookup and attach its reference. No automated scraping is enabled.'
    })
  },
  MP_RERA: {
    mode: 'MANUAL_OR_AUTHORIZED',
    execute: ({ property }) => ({
      status: 'MANUAL_REQUIRED', sourceKey: 'MP_RERA', propertyId: property.id,
      lookup: { project: property.project || '', developer: property.developer || '', location: property.location },
      requiredEvidence: ['registrationNumber', 'projectName', 'reference'],
      message: 'Use the authority record for the project and ingest the observed record with its reference. No automated access is claimed.'
    })
  },
  MP_TOWN_COUNTRY_PLANNING: {
    mode: 'PUBLIC_DOCUMENT',
    execute: ({ property }) => ({
      status: 'DOCUMENT_REVIEW_REQUIRED', sourceKey: 'MP_TOWN_COUNTRY_PLANNING', propertyId: property.id,
      lookup: { location: property.location, district: property.district || 'Jabalpur', khasra: property.khasra || '' },
      requiredEvidence: ['planName', 'publicationDate', 'page', 'reference'],
      message: 'Review the applicable planning document/map and ingest only the observed land-use/planning evidence with document reference and date.'
    })
  }
};

function connectorStatus() {
  return Object.entries(CONNECTORS).map(([key, c]) => ({
    key,
    registered: true,
    mode: c.mode,
    source: getSource(key)?.name || key,
    automatedFetch: false,
    status: 'SCAFFOLD_READY'
  }));
}

function runConnector(sourceKey, property) {
  const key = String(sourceKey || '').toUpperCase();
  const source = getSource(key);
  const connector = CONNECTORS[key];
  if (!source || !connector) return { ok: false, error: 'Connector not registered' };
  return { ok: true, source: { key: source.key, name: source.name, authority: source.authority }, connector: connector.execute({ property }) };
}

module.exports = { connectorStatus, runConnector };
