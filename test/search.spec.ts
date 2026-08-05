import {createRequire} from 'node:module';

import {afterEach, describe, expect, it, vi} from 'vitest';

const require = createRequire(import.meta.url);
const {buildTagsFilter, combineFilters, search, workerScope} =
    require('../src/client/search.js') as {
        buildTagsFilter: (tags: string[]) => string;
        combineFilters: (filters: string | undefined, tags: string[]) => string | undefined;
        search: (
            config: Record<string, unknown>,
            query: string,
            count?: number,
            page?: number,
            tags?: string[],
        ) => Promise<unknown>;
        workerScope: {
            onmessage: (message: {
                data: Record<string, unknown>;
                ports?: unknown[];
            }) => Promise<void>;
        };
    };

describe('Algolia client tag filters', () => {
    it('builds an OR expression and escapes facet values', () => {
        expect(buildTagsFilter(['info', 'syn"tax', 'path\\tag'])).toBe(
            'tags:"info" OR tags:"syn\\"tax" OR tags:"path\\\\tag"',
        );
    });

    it('returns an empty expression for an empty tag list', () => {
        expect(buildTagsFilter([])).toBe('');
    });

    it('combines tags with existing access or query filters using AND', () => {
        expect(combineFilters('visibility:public', ['info', 'syntax'])).toBe(
            '(visibility:public) AND (tags:"info" OR tags:"syntax")',
        );
    });

    it('wraps tags alone when there is no base filter', () => {
        expect(combineFilters(undefined, ['info'])).toBe('(tags:"info")');
    });

    it('keeps the base filter untouched when no tags are selected', () => {
        expect(combineFilters('visibility:public', [])).toBe('visibility:public');
        expect(combineFilters(undefined, [])).toBeUndefined();
    });

    it('keeps an unknown tag as a restrictive filter', () => {
        expect(buildTagsFilter(['unknown'])).toBe('tags:"unknown"');
    });
});

describe('Algolia client search request', () => {
    const config = {appId: 'app', searchApiKey: 'key', indexName: 'docs-en'};

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('throws when the configuration is incomplete', async () => {
        await expect(search({appId: 'app'}, 'query')).rejects.toThrow(
            /configuration is incomplete/,
        );
    });

    it('sends the combined tag filter and returns the response payload', async () => {
        const payload = {hits: [], nbHits: 0};
        const fetchMock = vi.fn().mockResolvedValue({json: () => Promise.resolve(payload)});

        vi.stubGlobal('fetch', fetchMock);

        const result = await search(config, 'query', 10, 1, ['info', 'syntax']);

        expect(result).toBe(payload);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://app.algolia.net/1/indexes/docs-en/query');

        const body = JSON.parse(options.body);
        expect(body.filters).toBe('(tags:"info" OR tags:"syntax")');
        expect(body.page).toBe(0);
    });

    it('omits the filter when no tags are selected', async () => {
        const fetchMock = vi.fn().mockResolvedValue({json: () => Promise.resolve({hits: []})});

        vi.stubGlobal('fetch', fetchMock);

        await search(config, 'query');

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.filters).toBeUndefined();
    });
});

describe('Algolia worker message handling', () => {
    const config = {appId: 'app', searchApiKey: 'key', indexName: 'docs-en'};

    const post = (data: Record<string, unknown>) =>
        new Promise((resolve) => {
            workerScope.onmessage({data, ports: [{postMessage: resolve}]});
        });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('passes selected tags from a search message down to the request', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({hits: [], nbHits: 0}),
        });

        vi.stubGlobal('fetch', fetchMock);

        await post({type: 'init', ...config});
        const reply = (await post({
            type: 'search',
            query: 'query',
            tags: ['info'],
        })) as {result: {total: number}};

        expect(reply.result).toMatchObject({total: 0});
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.filters).toBe('(tags:"info")');
    });

    it('logs an error for an unknown message type', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        await workerScope.onmessage({data: {type: 'unknown'}, ports: [{postMessage: () => {}}]});

        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });
});
