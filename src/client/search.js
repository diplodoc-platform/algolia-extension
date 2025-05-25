/// <reference no-default-lib="true"/>
/// <reference lib="ES2019" />
/// <reference lib="webworker" />

/* eslint-disable new-cap */

// Default configuration
const DEFAULT_CONFIG = {
    tolerance: 3,
    confidence: 0.5,
    mark: 'search-highlight',
    base: '',
};

// Message type for initialization
const INIT = 'init';
// Message type for search
const SEARCH = 'search';
// Message type for suggestions
const SUGGEST = 'suggest';

// Number of words for trimming results
const TRIM_WORDS = 10;

// Global self object in worker context
// Default type of `self` is `WorkerGlobalScope & typeof globalThis`
// https://github.com/microsoft/TypeScript/issues/14877
const NOT_INITIALIZED = {
    message: 'Worker is not initialized with required config!',
    code: 'NOT_INITIALIZED',
};

// Configuration validation
function AssertConfig(config) {
    if (!config) {
        throw NOT_INITIALIZED;
    }
}

// Worker configuration
let config = null;

// Worker API
self.api = {
    // Worker initialization
    async init() {
        config = {
            ...DEFAULT_CONFIG,
            ...self.config,
        };
    },

    // Search for suggestions
    async suggest(query) {
        AssertConfig(config);

        const results = await search(config, query);

        return format(config, results);
    },

    // Full search
    async search(query) {
        AssertConfig(config);

        const result = await search(config, query);

        return format(config, result);
    },
};

// Search function
async function search(config, query) {
    const { appId, searchKey, indexName, querySettings, mark } = config;

    const response = await fetch(`https://${appId}.algolia.net/1/indexes/${indexName}/query`, {
        method: 'POST',
        headers: {
            'x-algolia-application-id': appId,
            'x-algolia-api-key': searchKey,
        },
        body: JSON.stringify({
            ...querySettings,
            query,
            attributesToSnippet: [`content:${TRIM_WORDS}`],
            highlightPreTag: `<span class="${mark}">`,
            highlightPostTag: `</span>`,
        }),
    });

    return response.json();
}

// Format search results
function format(config, result) {
    const { base } = config;

    return result.hits.map(({ url, title, section, anchor, _highlightResult, _snippetResult }) => {
        const link = anchor 
            ? `${base.replace(/\/?$/, '')}/${url}#${anchor}`
            : `${base.replace(/\/?$/, '')}/${url}`;
            
        return {
            type: 'page',
            link,
            title: _highlightResult?.title?.value || title,
            section: section,
            description: _snippetResult?.content?.value || trim(_highlightResult?.content?.value, TRIM_WORDS),
        };
    });
}

// Trim text to a specific number of words
function trim(text, words) {
    if (!text) return '';
    
    const parts = text.split(/\s/);

    if (parts.length > words) {
        return parts.slice(0, words).join(' ') + '...';
    } else {
        return parts.join(' ');
    }
}