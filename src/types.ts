import { PropertyType } from 'sofp-lib';

export interface CollectionConfiguration {
    collectionPath : string;
    filterClause : any;
    variantTitle? : string;
    variantDescription? : string;
    subCollections : CollectionConfiguration [];
}

export interface ColumnDefinition {
    name : string;
    columnName? : string;
    type : PropertyType;
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
    geometryColumnName?: string;
    description: string;
    tableName: string;
    tableSchema: string;
    schemaName: string;
    crs: string;
    hidePrimaryKey?: boolean; // true if primaryKey column should not be included in properties
    columns: ColumnDefinition [];
    collection: CollectionConfiguration;
};

