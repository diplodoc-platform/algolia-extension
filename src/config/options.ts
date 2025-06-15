import {option} from '@diplodoc/cli/lib/config';

export const options = {
    input: option({
        flags: '-i, --input <path>',
        desc: 'Path to documentation directory',
        required: true,
        default: './',
    }),
    appId: option({
        flags: '--app-id <id>',
        desc: 'Algolia Application ID',
        env: 'ALGOLIA_APP_ID',
    }),
    apiKey: option({
        flags: '--api-key <key>',
        desc: 'Algolia API Key',
        env: 'ALGOLIA_API_KEY',
    }),
    indexName: option({
        flags: '--index-name <name>',
        desc: 'Algolia Index Name',
        env: 'ALGOLIA_INDEX_NAME',
    }),
    index: option({
        flags: '--index [boolean]',
        desc: 'Whether to create and upload an index for search',
    }),
    searchKey: option({
        flags: '--search-key <key>',
        desc: 'Client-side API key for search',
        env: 'ALGOLIA_SEARCH_KEY',
        default: 'search-api-key',
    }),
    provider: option({
        flags: '--search-provider <name>',
        desc: 'Search provider name',
        env: 'ALGOLIA_PROVIDER',
        default: 'algolia',
    }),
    api: option({
        flags: '--search-api <path>',
        desc: 'Path to the client-side search API',
        env: 'ALGOLIA_API_PATH',
        default: '_search/api.js',
    }),
};
