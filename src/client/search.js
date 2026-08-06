/// <reference no-default-lib="true"/>
/// <reference lib="ES2019" />
/// <reference lib="webworker" />

/* eslint-disable new-cap */
/* eslint-disable no-console */
/* eslint-env worker */
/* global module */

const DEFAULT_CONFIG = {
    tolerance: 3,
    confidence: 0.5,
    mark: 'search-highlight',
    base: '',
};

const TRIM_WORDS = 30;

const UNKNOWN_HANDLER = {
    message: 'Unknown message type!',
    code: 'UNKNOWN_HANDLER',
};

const NOT_INITIALIZED_CONFIG = {
    message: 'Worker is not initialized with required config!',
    code: 'NOT_INITIALIZED',
};

const NOT_INITIALIZED_API = {
    message: 'Worker is not initialized with required api!',
    code: 'NOT_INITIALIZED',
};

const workerScope = typeof self === 'undefined' ? {} : self;

function AssertConfig(config) {
    if (!config) {
        throw NOT_INITIALIZED_CONFIG;
    }
}

function AssertApi(api) {
    if (!api) {
        throw NOT_INITIALIZED_API;
    }
}

workerScope.api = {
    async init() {
        workerScope.config = {...DEFAULT_CONFIG, ...workerScope.config};
    },
    async suggest(query, count = 10) {
        AssertConfig(workerScope.config);
        const results = await search(workerScope.config, query, count);
        const formattedResults = format(workerScope.config, results);
        return formattedResults;
    },
    async search(query, count = 10, page = 1, tags = []) {
        AssertConfig(workerScope.config);
        const result = await search(workerScope.config, query, count, page, tags);
        const formattedResults = format(workerScope.config, result);
        const total = result.nbHits || (result.hits ? result.hits.length : 0);

        return {
            items: formattedResults,
            total: total,
        };
    },
};

async function search(config, query, count = 10, page = 1, tags = []) {
    const appId = config.appId;
    const searchApiKey = config.searchApiKey;
    const indexName = config.indexName;
    const querySettings = config.querySettings;

    if (!appId || !searchApiKey || !indexName) {
        throw new Error(
            'Algolia configuration is incomplete. Missing appId, searchApiKey or indexName.',
        );
    }

    const url = `https://${appId}.algolia.net/1/indexes/${indexName}/query`;

    const markClass = config.mark || 'search-highlight';
    const requestBody = Object.assign({}, querySettings, {
        query: query,
        hitsPerPage: count,
        page: page - 1,
        attributesToSnippet: [`content:${TRIM_WORDS}`],
        highlightPreTag: `<span class="${markClass}">`,
        highlightPostTag: `</span>`,
    });
    requestBody.filters = combineFilters(requestBody.filters, tags);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'x-algolia-application-id': appId,
            'x-algolia-api-key': searchApiKey,
        },
        body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    return data;
}

function buildTagsFilter(tags) {
    return tags.map((tag) => `tags:${JSON.stringify(String(tag))}`).join(' OR ');
}

function combineFilters(filters, tags) {
    const tagsFilter = buildTagsFilter(tags);

    if (!tagsFilter) {
        return filters;
    }

    return filters ? `(${filters}) AND (${tagsFilter})` : `(${tagsFilter})`;
}

function format(config, result) {
    const base = config.base || '';

    if (!result.hits) {
        return [];
    }

    return result.hits.map(function (hit) {
        const url = hit.url;
        const title = hit.title;
        const section = hit.section;
        const anchor = hit.anchor;
        const highlightResult = hit._highlightResult;
        const snippetResult = hit._snippetResult;

        const link = anchor
            ? base.replace(/\/?$/, '') + '/' + url + '#' + anchor
            : base.replace(/\/?$/, '') + '/' + url;

        const highlightedContent =
            highlightResult && highlightResult.content && highlightResult.content.value;
        const description =
            (snippetResult && snippetResult.content && snippetResult.content.value) ||
            (highlightedContent ? trim(highlightedContent, TRIM_WORDS) : '');

        return {
            type: 'page',
            link: link,
            title:
                (highlightResult && highlightResult.section && highlightResult.section.value) ||
                section ||
                (highlightResult && highlightResult.title && highlightResult.title.value) ||
                title,
            section: section,
            description: description,
        };
    });
}

function trim(text, words) {
    if (!text) return '';
    const parts = text.split(/\s/);
    if (parts.length > words) {
        return parts.slice(0, words).join(' ') + '...';
    } else {
        return parts.join(' ');
    }
}

const HANDLERS = {
    async init(config) {
        workerScope.config = config;
        if (workerScope.api?.init) {
            return workerScope.api.init();
        }
        return;
    },
    async suggest(data) {
        const {query, count = 10} = data;
        AssertConfig(workerScope.config);
        AssertApi(workerScope.api);
        return workerScope.api.suggest(query, count);
    },
    async search(data) {
        const {query, count = 10, page = 1, tags = []} = data;
        AssertConfig(workerScope.config);
        AssertApi(workerScope.api);
        return workerScope.api.search(query, count, page, tags);
    },
};

function reply(message, data) {
    if (message.ports && message.ports[0]) {
        message.ports[0].postMessage(data);
    } else {
        workerScope.postMessage(data);
    }
}

workerScope.onmessage = async function (message) {
    const type = message.data.type;
    const handler = HANDLERS[type];

    if (!handler) {
        const errorMessage = `${UNKNOWN_HANDLER.code}: ${UNKNOWN_HANDLER.message}`;

        console.error(errorMessage);

        return;
    }

    try {
        const result = await handler(message.data);
        reply(message, {result});
    } catch (error) {
        reply(message, {error});
    }
};

if (typeof module !== 'undefined') {
    module.exports = {buildTagsFilter, combineFilters, search, workerScope};
}
