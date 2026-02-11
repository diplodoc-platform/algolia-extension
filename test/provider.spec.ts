import type {BuildRun} from '@diplodoc/cli';

import {join} from 'path';
import {algoliasearch} from 'algoliasearch';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {AlgoliaProvider} from '../src/core/provider';
import {AlgoliaProviderConfig} from '../src/types';

vi.mock('algoliasearch');

vi.mock('../src/core/utils', () => {
    return {
        ALGOLIA_METHODS: {
            REPLACE_ALL_OBJECTS: 'replaceAllObjects',
            SAVE_OBJECTS: 'saveObjects',
        },
        IndexLogger: vi.fn().mockImplementation(() => ({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            pipe: vi.fn(),
        })),
        getBaseLang: vi.fn((lang: string) => (lang === 'ru' ? 'ru' : 'en')),
        pageLink: vi.fn((lang: string) => join('_search', lang, 'index.html')),
        uploadRecordsToAlgolia: vi
            .fn()
            .mockImplementation(
                async (
                    client: unknown,
                    indexName: string,
                    _lang: string,
                    records: unknown[],
                    method: string,
                ) => {
                    const c = client as {
                        [k: string]: (opts: {
                            indexName: string;
                            objects: unknown[];
                        }) => Promise<unknown>;
                    };
                    await c[method]({indexName, objects: records});
                },
            ),
        ensureClient: vi.fn((client: unknown) => client),
        DEFAULT_INDEX_SETTINGS: {
            distinct: 1,
            attributeForDistinct: 'url',
        },
    };
});

interface MockLogger {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
}

interface MockSearch {
    page: ReturnType<typeof vi.fn>;
}

class MockBuildRun {
    originalInput: string;
    output: string;
    logger: MockLogger;
    search: MockSearch;
    glob: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    copy: ReturnType<typeof vi.fn>;

    constructor(config: Record<string, unknown> = {}) {
        this.originalInput = (config.input as string) || '/test/input';
        this.output = (config.output as string) || '/test/output';
        this.logger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
        this.search = {
            page: vi.fn().mockResolvedValue('<html></html>'),
        };
        this.glob = vi.fn().mockResolvedValue([]);
        this.read = vi.fn().mockResolvedValue('[]');
        this.write = vi.fn().mockResolvedValue(undefined);
        this.copy = vi.fn().mockResolvedValue(undefined);
    }
}

const mockAlgoliaClient = {
    setSettings: vi.fn().mockResolvedValue({}),
    replaceAllObjects: vi.fn().mockResolvedValue({taskID: 123}),
    saveObjects: vi.fn().mockResolvedValue({taskID: 456}),
    clearObjects: vi.fn().mockResolvedValue({}),
    waitForTask: vi.fn().mockResolvedValue({}),
};

vi.mocked(algoliasearch).mockReturnValue(
    mockAlgoliaClient as unknown as ReturnType<typeof algoliasearch>,
);

describe('AlgoliaProvider', () => {
    let provider: AlgoliaProvider;
    let mockRun: MockBuildRun;
    let config: AlgoliaProviderConfig;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRun = new MockBuildRun();
        config = {
            appId: 'test-app-id',
            apiKey: 'test-api-key',
            searchApiKey: 'test-search-api-key',
            indexName: 'test-index',
            index: true,
        };

        provider = new AlgoliaProvider(mockRun as unknown as BuildRun, config);
    });

    describe('constructor', () => {
        it('should initialize Algolia client with correct credentials', () => {
            expect(algoliasearch).toHaveBeenCalledWith('test-app-id', 'test-api-key');
        });

        it('should use default indexPrefix when not provided', () => {
            const configWithoutPrefix = {
                appId: 'test-app-id',
                apiKey: 'test-api-key',
                indexName: 'docs',
                searchApiKey: 'test-search-api-key',
            };

            const newProvider = new AlgoliaProvider(
                mockRun as unknown as BuildRun,
                configWithoutPrefix,
            );
            const result = newProvider.config('en');

            expect(result.indexName).toBe('docs-en');
        });
    });

    describe('addObjects', () => {
        it('should load and process records from JSON files', async () => {
            const testRecords = [
                {objectID: 'test-1', title: 'Test 1', content: 'Content 1'},
                {objectID: 'test-2', title: 'Test 2', content: 'Content 2'},
            ];

            mockRun.glob.mockResolvedValue(['en-algolia.json']);
            mockRun.read.mockResolvedValue(JSON.stringify(testRecords));

            await provider.addObjects();

            expect(mockRun.glob).toHaveBeenCalledWith('*-algolia.json', {
                cwd: join('/test/input', '_search'),
            });

            expect(mockRun.read).toHaveBeenCalledWith(
                join('/test/input', '_search', 'en-algolia.json'),
            );

            expect(mockAlgoliaClient.replaceAllObjects).toHaveBeenCalledWith({
                indexName: 'test-index-en',
                objects: testRecords,
            });
        });

        it('should not process anything when index is false', async () => {
            const noIndexConfig = {...config, index: false};
            const noIndexProvider = new AlgoliaProvider(
                mockRun as unknown as BuildRun,
                noIndexConfig,
            );

            await noIndexProvider.addObjects();

            expect(mockRun.glob).not.toHaveBeenCalled();
            expect(mockAlgoliaClient.replaceAllObjects).not.toHaveBeenCalled();
        });

        it('should not upload to Algolia when index is false', async () => {
            const noIndexConfig = {...config, index: false};
            const noIndexProvider = new AlgoliaProvider(
                mockRun as unknown as BuildRun,
                noIndexConfig,
            );

            await noIndexProvider.addObjects();

            expect(mockRun.glob).not.toHaveBeenCalled();
            expect(mockAlgoliaClient.replaceAllObjects).not.toHaveBeenCalled();
        });
    });

    describe('config', () => {
        it('should return correct search configuration for client', () => {
            const result = provider.config('en');

            expect(result).toEqual({
                provider: 'algolia',
                api: '_search/api.js',
                link: join('_search', 'en', 'index.html'),
                appId: 'test-app-id',
                indexName: 'test-index-en',
                searchApiKey: 'test-search-api-key',
                querySettings: {},
            });
        });

        it('should include custom query settings if provided', () => {
            const configWithQuerySettings = {
                ...config,
                querySettings: {hitsPerPage: 20, attributesToRetrieve: ['title', 'content']},
            };

            const providerWithQuerySettings = new AlgoliaProvider(
                mockRun as unknown as BuildRun,
                configWithQuerySettings,
            );
            const result = providerWithQuerySettings.config('en');

            expect(result.querySettings).toEqual({
                hitsPerPage: 20,
                attributesToRetrieve: ['title', 'content'],
            });
        });
    });
});
