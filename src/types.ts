
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
    geometryColumnName?: string;
    description: string;
    tableName: string;
    tableSchema: string;
    schemaName: string;
    crs: string;
    columns: ColumnDefinition [];
    collection: CollectionConfiguration;
};

