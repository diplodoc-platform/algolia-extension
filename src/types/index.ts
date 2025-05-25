import type {
    IndexSettings,
    SearchParamsObject,
} from "algoliasearch";

/**
 * Algolia provider configuration
 */
export interface AlgoliaProviderConfig {
    appId: string;
    apiKey?: string;
    searchKey: string;
    indexName: string;
    indexPrefix?: string;
    indexSettings?: Partial<IndexSettings>;
    querySettings?: Partial<SearchParamsObject>;
    index?: boolean;
    uploadDuringBuild?: boolean;
    api?: string;
}

/**
 * Algolia index record
 */
export interface AlgoliaRecord {
    objectID: string;
    title: string;
    content: string;
    headings: string[];
    keywords: string[];
    anchor?: string;
    url: string;
    lang: string;
    section?: string;
}

/**
 * Document section
 */
export interface DocumentSection {
    heading: string;
    content: string;
    anchor?: string;
}

/**
 * Document metadata
 */
export interface DocumentMeta {
    noIndex?: boolean;
    keywords?: string[];
    title?: string;
    description?: string;
    [key: string]: any;
}

/**
 * Document processing result
 */
export interface ProcessingResult {
    records: AlgoliaRecord[];
    lang: string;
}

/**
 * Worker message types
 */
export type MessageType = 'process' | 'result' | 'error';

/**
 * Base worker message
 */
export interface WorkerMessage {
    type: MessageType;
    data: any;
}

/**
 * Document processing message
 */
export interface ProcessMessage extends WorkerMessage {
    type: 'process';
    data: {
        path: string;
        lang: string;
        html: string;
        title: string;
        meta: DocumentMeta;
    };
}

/**
 * Processing result message
 */
export interface ResultMessage extends WorkerMessage {
    type: 'result';
    data: {
        records: AlgoliaRecord[];
    };
}

/**
 * Error message
 */
export interface ErrorMessage extends WorkerMessage {
    type: 'error';
    data: {
        message: string;
        stack?: string;
    };
}

/**
 * Extended Algolia configuration
 */
export interface AlgoliaConfig {
    input: string;
    search: {
        provider: "algolia";
        appId: string;
        apiKey: string;
        indexName: string;
    };
}

/**
 * Document processing context
 */
export interface DocumentProcessingContext {
    path: string;
    lang: string;
    html: string;
    title: string;
    meta: DocumentMeta;
}