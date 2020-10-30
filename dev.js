
const sofp = require('sofp-core');
const sofpLib = require('sofp-lib');

const pg = require('./dist/');

const columnsAuInspire= [
    { name: "id", type: "string", primaryKey: true },

    { name: "inspireId_localId",      type: "string", primaryKey: true },
    { name: "inspireId_versionId",    type: "number" },
    { name: "inspireId_namespace",    type: "string" },

    { name: "beginLifespanVersion",   type: "date", outputTz: "Europe/Helsinki", dateFormat: "YYYY-MM-DD", timeStart: true },
    { name: "endLifespanVersion",     type: "date", outputTz: "Europe/Helsinki", dateFormat: "YYYY-MM-DD", timeEnd: true },
    { name: "country",                type: "string" },
    { name: "name_fin",               type: "string" },
    { name: "name_swe",               type: "string" },
    { name: "name_eng",               type: "string" },
    { name: "nationalCode",           type: "string" },
    { name: "nationalLevel",          type: "string" },
    { name: "nationalLevelName",      type: "string" },
    { name: "secondaryGeometry", columnName: 'wkb_geometry',      type: "geometry" },
    { name: "upperLevelUnit",         type: "string", array: true },
    { name: "lowerLevelUnit",         type: "string", array: true }
];


const tableDefinition = {
    title: `INSPIRE Administrative units 4500k`,
    name: `au_inspire_4500k_wgs84`,
    description: `These are administrative units in Finland in 4500k scale, WGS84`,
    tableName: `au_inspire_4500k_wgs84`,
    tableSchema: 'public',
    crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84',
    columns : columnsAuInspire,

    schemaName: 'au_inspire'
};

const collectionDefinition= {
    collectionPath: '',
    filterClause: undefined,
    subCollections: []
};


pg.tryConnect({
    url: 'postgresql://docker:docker@localhost:5432/gis'
}, function(err, client) {
    if (err) {
        console.error(err);
        return;
    }

    const backend = new sofpLib.Backend('SofpPostGIS');

    const collection = new pg.PostGISCollection(tableDefinition, collectionDefinition, [] ,client)
    backend.collections.push(collection)

    var params = {
      title:         'Example SOFP-PostGIS Server',
      description:   'Example SOFP API Features server',
      serverPort:    3000,
      contextPath:   '/sofp',
      accessLogPath: null,
      backends:      [backend],
    }

    sofp.run(params);

});
