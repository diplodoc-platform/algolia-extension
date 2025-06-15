import type {IndexSettings, SearchParamsObject} from 'algoliasearch';

export interface AlgoliaProviderConfig {
    appId: string;
    apiKey?: string;
    searchApiKey?: string;
    indexName?: string;
    indexSettings?: Partial<IndexSettings>;
    querySettings?: Partial<SearchParamsObject>;
    index?: boolean;
    api?: string;
}

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

export interface DocumentSection {
    heading: string;
    content: string;
    anchor?: string;
}

export interface DocumentMeta {
    noIndex?: boolean;
    keywords?: string[];
    title?: string;
    description?: string;
    [key: string]: unknown;
}

export interface ProcessingResult {
    records: AlgoliaRecord[];
    lang: string;
}

export type MessageType = 'process' | 'result' | 'error' | 'terminate';

export interface WorkerMessage {
    type: MessageType;
    data: unknown;
}

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

export interface ResultMessage extends WorkerMessage {
    type: 'result';
    data: {
        records: AlgoliaRecord[];
    };
}

export interface ErrorMessage extends WorkerMessage {
    type: 'error';
    data: {
        message: string;
        stack?: string;
    };
}

export interface AlgoliaConfig {
    input: string;
    search: {
        provider: 'algolia';
        appId: string;
        apiKey: string;
        indexName?: string;
        searchApiKey?: string;
        index?: boolean;
        api?: string;
    };
}

export interface DocumentProcessingContext {
    path: string;
    lang: string;
    html: string;
    title: string;
    meta: DocumentMeta;
}
