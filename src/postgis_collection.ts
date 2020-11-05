import {Backend, Collection, Link, QueryParameter, Query, FeatureStream, PropertyType, Feature, Filter, Property} from 'sofp-lib';

import * as _ from 'lodash';
import moment from 'moment-timezone';
import Knex from 'knex';
import KnexPostgis from 'knex-postgis';
import * as wkx from 'wkx';

import * as proj4 from 'proj4';
import * as pg from 'pg';

import {ColumnDefinition, TableDefinition, CollectionConfiguration} from './types';

proj4.defs('http://www.opengis.net/def/crs/OGC/1.3/CRS84', '+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees');
proj4.defs('http://www.opengis.net/def/crs/EPSG/0/3067',   '+proj=utm +zone=35 +ellps=GRS80 +units=m +no_defs ');

function crsUrlToNumber(crs) {
   if (crs === 'http://www.opengis.net/def/crs/OGC/1.3/CRS84') {
       return 4326;
   }
   return Number(crs.substring(crs.lastIndexOf('/')+1));
}

const db = Knex({
  client: 'postgres'
});

const st = KnexPostgis(db);

var Client = require('pg').Client;

/**
 * Example queries:
 *
 * Get WGS84 features using an WGS84 bounding box
 * http://localhost:3000/sofp/collections/au_inspire_250k_wgs84/items?f=json&bbox=23,59,24,61
 *
 * Get WGS84 features using an EPSG:3067 bounding box
 * http://localhost:3000/sofp/collections/au_inspire_250k_wgs84/items?f=json&bbox=472300,6798000,472400,6799000&bbox-crs=http%3A%2F%2Fwww.opengis.net%2Fdef%2Fcrs%2FEPSG%2F0%2F3067
 *
 *
 * Get EPSG:3067 features using an WGS84 bounding box
 * http://localhost:3000/sofp/collections/au_inspire_250k_3067/items?f=json&bbox=23,59,24,61&bbox-crs=http%3A%2F%2Fwww.opengis.net%2Fdef%2Fcrs%2FOGC%2F1.3%2FCRS84
 * http://localhost:3000/sofp/collections/au_inspire_250k_3067/items?f=json&bbox=23,59,24,61
 *
 * Get EPSG:3067 features using an EPSG:3067 bounding box
 * http://localhost:3000/sofp/collections/au_inspire_250k_3067/items?f=json&bbox=472300,6798000,472400,6799000&bbox-crs=http%3A%2F%2Fwww.opengis.net%2Fdef%2Fcrs%2FEPSG%2F0%2F3067
 *
 **/

function resultToGeoJSON(item, tableDef : TableDefinition) {
    const pk  = _.find(tableDef.columns, c => c.primaryKey);

    function nullSafeGeom(geom) {
        if (geom) {
            return wkx.Geometry.parse(geom).toGeoJSON();
        } else {
            return null;
        }
    }

    function getValue(c : ColumnDefinition) {
        var value = item[c.columnName || c.name];
        if (c.valueFn) {
            value = null;
        } else if (c.type === PropertyType.date && value !== null && value !== undefined) {
            value = moment(value).tz(c.outputTz).format(c.dateFormat);
        } else if (c.type === PropertyType.geometry) {
            value = nullSafeGeom(value);
        }
        return value;
    }

    const feature = {
        id: getValue(pk),
        type: 'Feature',
        geometry: nullSafeGeom(item.geometry),
        properties: _.reduce(tableDef.columns, (memo, c) => {
            if (c.primaryKey && tableDef.hidePrimaryKey) {
                return memo;
            }
            memo[c.name] = getValue(c);
            return memo;
        }, {})
    }

    _.each(_.filter(tableDef.columns, c => !!c.valueFn), c => {
        feature.properties[c.name] = c.valueFn(feature);
    });

    return feature;
}

export class PostGISCollection implements Collection {
    title : string;
    id : string;
    description : string;
    links : Link[] = [];

    schemaName : string;

    tableDefinition : TableDefinition;
    collection : CollectionConfiguration;
    superCollections : CollectionConfiguration [];

    properties : Property [];

    additionalQueryParameters : QueryParameter [] = [];

    client : pg.Client = null;

    constructor(tableDef : TableDefinition, collection : CollectionConfiguration, superCollections : CollectionConfiguration [], client : pg.Client) {
        this.title = tableDef.title;
        if (collection.variantTitle) {
            this.title += ` (${collection.variantTitle})`;
        }
        this.id = tableDef.name + collection.collectionPath;
        this.schemaName = tableDef.schemaName;

        this.description = tableDef.description;
        if (collection.variantDescription) {
            this.description += ` (${collection.variantDescription})`;
        }
        this.collection = collection;
        this.superCollections = superCollections;
        this.client = client;

        this.tableDefinition = tableDef;

        this.properties = _.map(tableDef.columns, col => { return {
            name: col.name,
            type: col.type,
            description: col.description
        }});
    }

    extractFilter(ret : FeatureStream, filterClass : string) {
        const filter = _.find(ret.remainingFilter, f => f.filterClass === filterClass);
        if (filter) {
            ret.remainingFilter = _.without(ret.remainingFilter, filter);
        }
        return filter;
    }

    produceColumnsToSelect() : Object[] {
        var realColumns = _.filter(this.tableDefinition.columns, c => !c.valueFn);
        var columns_to_select : Object[] = _.map(realColumns, c => {
            if (c.type === PropertyType.geometry) {
                return st.asText(c.columnName || c.name);
            } else {
                return c.columnName || c.name;
            }
        });
        columns_to_select.push(st.asText(this.tableDefinition.geometryColumnName || 'wkb_geometry').as('geometry'));

        return columns_to_select;
    }

    executeQuery(query : Query) : FeatureStream {
        var ret = new FeatureStream();

        ret.remainingFilter = query.filters;

        const propertyFilter = this.extractFilter(ret, 'PropertyFilter');
        const bboxFilter     = this.extractFilter(ret, 'BBOXFilter');
        const timeFilter     = this.extractFilter(ret, 'TimeFilter');

        var nextToken = Number(query.nextToken || '0');
        var outputCount = 0;
        var that = this;

        var columns_to_select : Object[] = that.produceColumnsToSelect();
        var column_to_sort = _.find(this.tableDefinition.columns, c => c.primaryKey);
        var q = db
            .select(columns_to_select)
            .withSchema(that.tableDefinition.tableSchema || 'public')
            .from(that.tableDefinition.tableName)
            .orderBy(column_to_sort.columnName || column_to_sort.name)
            .offset(Number(query.nextToken || 0));

        _.each(that.superCollections, c => {
            if (c.filterClause) {
                q = c.filterClause(q);
            }
        });
        if (that.collection.filterClause) {
            q = that.collection.filterClause(q);
        }
        
        if (propertyFilter) {
            _.each(propertyFilter.parameters.properties, (v, k) => {
                var column = _.find(that.tableDefinition.columns, c => c.name.toLowerCase() === k.toLowerCase());
                if (column.valueFn) {
                    throw new Error('Unable to filter via a virtual column');
                }
                if (column.type === PropertyType.geometry) {
                    throw new Error('Unable to filter by geometry column');
                }
                if (column.array) {
                    q = q.where(column.columnName || column.name, '@>', [v]);
                } else {
                    q = q.where(column.columnName || column.name, v);
                }
            });
        }

        ret.crs = that.tableDefinition.crs;

        if (bboxFilter) {
            let needsTransform = bboxFilter.parameters.bboxCrs !== that.tableDefinition.crs;
            let intersectsGeometry;
            if (!needsTransform) {
                intersectsGeometry = st.makeEnvelope(
                    bboxFilter.parameters.coords[0],
                    bboxFilter.parameters.coords[1],
                    bboxFilter.parameters.coords[2],
                    bboxFilter.parameters.coords[3],
                    crsUrlToNumber(bboxFilter.parameters.bboxCrs)
                );
            } else {
                if (!proj4.defs(bboxFilter.parameters.bboxCrs)) {
                    ret.push(new Error(`bbox-crs (${bboxFilter.parameters.bboxCrs}) not supported`));
                    return ret;
                }
                if (!proj4.defs(that.tableDefinition.crs)) {
                    ret.push(new Error(`Data CRS (${that.tableDefinition.crs}) not supported`));
                    return ret;
                }
                function tr(ix,iy) {
                    return proj4(
                        bboxFilter.parameters.bboxCrs,
                        that.tableDefinition.crs,
                        [ bboxFilter.parameters.coords[ix],bboxFilter.parameters.coords[iy] ]);
                }
                let polygonCoords = [ tr(0,1), tr(2,1), tr(2,3), tr(0,3), tr(0,1) ];
                var polyText = 'POLYGON(('+_.map(polygonCoords, coords => (coords[0]+' '+coords[1])).join (', ') +'))';
                intersectsGeometry = st.geomFromText(polyText, crsUrlToNumber(that.tableDefinition.crs));
            }

            q = q.where(st.intersects(that.tableDefinition.geometryColumnName || 'wkb_geometry', intersectsGeometry));
        }

        if (timeFilter) {
            let timeEndCol = _.find(this.tableDefinition.columns, c => c.timeEnd);
            let timeStartCol = _.find(this.tableDefinition.columns, c => c.timeStart);
            if (timeFilter.parameters.momentStart) {
                q = q.where(timeEndCol.columnName || timeEndCol.name, '>=', timeFilter.parameters.momentStart.toDate());
            }
            if (timeFilter.parameters.momentEnd) {
                q = q.where(timeEndCol.columnName || timeStartCol.name, '<=', timeFilter.parameters.momentEnd.toDate());
            }
        }

        if (ret.remainingFilter.length == 0) {
            q = q.limit(query.limit);
        } else {
            console.log('WARNING! This backend was unable to process all filters for a query and might use a lot of memory! Unsupported filterClasses: '+_.map(ret.remainingFilter, f => f.filterClass));
        }

        that.client.query(q.toString(), (err, result) => {
            var item, i;
            if (err) {
                ret.push(new Error(err));
                return;
            }

            for (i = 0; i < result.rows.length; i++) {
                item = resultToGeoJSON(result.rows[i], that.tableDefinition);
                if (ret.push({ feature: item, nextToken: ''+(i+1+nextToken)})) {
                    outputCount++;
                    if (outputCount >= query.limit) {
                        break;
                    }
                }
            }
            ret.push(null);
        });

        return ret;
    }

    getFeatureById(id : string) : Promise<Feature> {
        const that = this;

        var ret = new Promise<Feature>((resolve, reject) => {

            var columns_to_select : Object[] = that.produceColumnsToSelect();
            
            var pk = _.find(that.tableDefinition.columns, c => c.primaryKey);

            var q = db
                .select(columns_to_select)
                .withSchema(that.tableDefinition.tableSchema || 'public')
                .from(that.tableDefinition.tableName)
                .where(pk.columnName || pk.name, id);
            
            if (that.collection.filterClause) {
                q = that.collection.filterClause(q);
            }
            _.each(that.superCollections, c => {
                if (c.filterClause) {
                    q = c.filterClause(q);
                }
            });

            that.client.query(q.toString(), (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    if (result.rows.length == 0) {
                        resolve(null);
                    } else {
                        resolve(resultToGeoJSON(result.rows[0], that.tableDefinition));
                    }
                }
            });
        });
        
        return ret;
    }
};
