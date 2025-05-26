import type {BuildRun} from '@diplodoc/cli';

import {join} from 'path';
import {algoliasearch} from 'algoliasearch';

import {AlgoliaProvider} from '../src/core/provider';
import {AlgoliaProviderConfig} from '../src/types';

jest.mock('algoliasearch');

jest.mock('../src/core/utils', () => {
    return {
        ALGOLIA_METHODS: {
            REPLACE_ALL_OBJECTS: 'replaceAllObjects',
            SAVE_OBJECTS: 'saveObjects',
        },
        IndexLogger: jest.fn().mockImplementation(() => ({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            pipe: jest.fn(),
        })),
        getBaseLang: jest.fn((lang) => (lang === 'ru' ? 'ru' : 'en')),
        pageLink: jest.fn((lang) => join('_search', lang, 'index.html')),
        uploadRecordsToAlgolia: jest
            .fn()
            .mockImplementation(async (client, indexName, _lang, records, method) => {
                await client[method]({
                    indexName,
                    objects: records,
                });
            }),
        ensureClient: jest.fn((client) => client),
        DEFAULT_INDEX_SETTINGS: {
            distinct: 1,
            attributeForDistinct: 'url',
        },
    };
});

interface MockLogger {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
}

interface MockSearch {
    page: jest.Mock;
}

class MockBuildRun {
    originalInput: string;
    output: string;
    logger: MockLogger;
    search: MockSearch;
    glob: jest.Mock;
    read: jest.Mock;
    write: jest.Mock;
    copy: jest.Mock;

    constructor(config: Record<string, unknown> = {}) {
        this.originalInput = (config.input as string) || '/test/input';
        this.output = (config.output as string) || '/test/output';
        this.logger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };
        this.search = {
            page: jest.fn().mockResolvedValue('<html></html>'),
        };
        this.glob = jest.fn().mockResolvedValue([]);
        this.read = jest.fn().mockResolvedValue('[]');
        this.write = jest.fn().mockResolvedValue(undefined);
        this.copy = jest.fn().mockResolvedValue(undefined);
    }
}

const mockAlgoliaClient = {
    setSettings: jest.fn().mockResolvedValue({}),
    replaceAllObjects: jest.fn().mockResolvedValue({taskID: 123}),
    saveObjects: jest.fn().mockResolvedValue({taskID: 456}),
    clearObjects: jest.fn().mockResolvedValue({}),
    waitForTask: jest.fn().mockResolvedValue({}),
};

(algoliasearch as jest.Mock).mockReturnValue(mockAlgoliaClient);

describe('AlgoliaProvider', () => {
    let provider: AlgoliaProvider;
    let mockRun: MockBuildRun;
    let config: AlgoliaProviderConfig;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRun = new MockBuildRun();
        config = {
            appId: 'test-app-id',
            apiKey: 'test-api-key',
            searchKey: 'test-search-key',
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
                searchKey: 'test-search-key',
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
                searchKey: 'test-search-key',
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
