import * as _ from 'lodash';
import * as moment from 'moment-timezone';

const currentYear = 2020
const includedYears = [2020, 2019, 2018]
const includedYearsAllSea = [2020] // Which year has all the sea scales (2018 and 2019 has only 1000k and 4500k)
const includedScales = ['10k', '100k', '250k', '1000k', '4500k']
const includedScalesSea = ['100k', '250k', '1000k', '4500k']

function getYearsBySeaScale(scale: string) {
    if (_.includes(['100k', '250k'], scale)) return includedYearsAllSea;
    return includedYears;
}

export interface CollectionConfiguration {
    collectionPath : string;
    filterClause : any;
    variantTitle? : string;
    variantDescription? : string;
    subCollections : CollectionConfiguration [];
}

export interface ColumnDefinition {
    name : string;
    type : string;
    description? : string;
    outputTz? : string;
    dateFormat? : string;
    primaryKey? : boolean;
    timeStart? : boolean;
    timeEnd? : boolean;
    array? : boolean;
};

export interface TableDefinition {
    title: string;
    name: string;
    description: string;
    tableName: string;
    schemaName: string;
    crs: string;
    columns: ColumnDefinition [];
    collection: CollectionConfiguration;
};

