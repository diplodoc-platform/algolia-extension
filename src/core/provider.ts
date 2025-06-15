import type {
    Algoliasearch,
    IndexSettings,
    SearchParamsObject,
    SupportedLanguage,
} from 'algoliasearch';
import type {BuildRun, EntryInfo, SearchProvider} from '@diplodoc/cli';

import {algoliasearch} from 'algoliasearch';
import {join} from 'path';

import {AlgoliaProviderConfig, AlgoliaRecord, DocumentMeta} from '../types';
import {AlgoliaWorkerPool} from '../workers';

import {processDocument} from './document-processor';
import {
    ALGOLIA_METHODS,
    AlgoliaMethod,
    DEFAULT_INDEX_SETTINGS,
    IndexLogger,
    ensureClient,
    getBaseLang,
    pageLink,
    uploadRecordsToAlgolia,
} from './utils';

export class AlgoliaProvider implements SearchProvider {
    private index: boolean;
    private appId: string;
    private apiKey?: string;
    private searchApiKey?: string;
    private indexName: string;
    private indexSettings: Partial<IndexSettings>;
    private querySettings: Partial<SearchParamsObject>;
    private objects: Record<string, AlgoliaRecord[]> = {};
    private client?: Algoliasearch;
    private run: BuildRun;
    private logger = new IndexLogger();
    private apiLink: string;
    private workerPool?: AlgoliaWorkerPool;

    constructor(run: BuildRun, config: AlgoliaProviderConfig) {
        this.run = run;
        this.index = config.index === undefined ? false : Boolean(config.index);

        if (!config.appId) {
            this.logger.error('Algolia appId is not specified');
        }
        this.appId = config.appId;

        if (!config.indexName) {
            this.logger.warn('Index name (indexName) is not specified. Using default value "docs"');
        }

        this.indexName = config.indexName || 'docs';

        this.logger.info(`Using index name: ${this.indexName}`);

        this.apiKey = config.apiKey;
        this.searchApiKey = config.searchApiKey;
        this.indexSettings = config.indexSettings || {};
        this.querySettings = config.querySettings || {};
        this.apiLink = config.api || '_search/api.js';

        if (this.apiKey) {
            try {
                this.client = algoliasearch(this.appId, this.apiKey);
                this.logger.info('Algolia client successfully initialized');
            } catch (error) {
                this.logger.error('Error initializing Algolia client:', error);
            }
        } else {
            this.logger.warn('API key not provided, Algolia client not initialized');
        }

        if (run?.logger) {
            this.logger.pipe(run.logger);
        }

        try {
            this.workerPool = new AlgoliaWorkerPool();
            this.workerPool.initialize();
            this.logger.info('Worker pool successfully initialized');
        } catch (error) {
            this.logger.error('Error initializing worker pool:', error);
        }
    }

    async add(path: string, lang: string, info: EntryInfo) {
        if (!info.html) {
            return;
        }

        const {title = '', meta = {}} = info;

        if (meta.noIndex) {
            return;
        }

        if (this.workerPool) {
            this.workerPool.addTask(path, lang, info.html, title, meta);
        } else {
            this.processDocumentSync(path, lang, info.html, title, meta);
        }
    }

    async addObjects(): Promise<void> {
        if (!this.index) {
            return;
        }

        const searchDir = join(this.run.originalInput, '_search');
        const files = await this.run.glob('*-algolia.json', {cwd: searchDir});

        for (const file of files) {
            const langMatch = file.match(/^([a-z]{2})-algolia\.json$/);
            if (!langMatch) {
                continue;
            }

            const lang = langMatch[1];
            const filePath = join(searchDir, file);

            const content = await this.run.read(filePath);
            const records = JSON.parse(content) as AlgoliaRecord[];

            const indexName = this.createIndexName(lang);
            await this.uploadRecordsToAlgolia(
                indexName,
                lang,
                records,
                ALGOLIA_METHODS.REPLACE_ALL_OBJECTS,
            );
        }
    }

    async clearIndex(): Promise<void> {
        if (!this.index) {
            return;
        }

        const client = this.ensureClient();
        for (const lang of Object.keys(this.objects)) {
            const indexName = this.createIndexName(lang);
            await client.clearObjects({indexName});
        }
    }

    async setSettings(settings: Partial<IndexSettings>): Promise<void> {
        if (!this.index) {
            return;
        }

        const client = this.ensureClient();
        for (const lang of Object.keys(this.objects)) {
            const indexName = this.createIndexName(lang);
            const baseLang = getBaseLang(lang);

            await client.setSettings({
                indexName,
                indexSettings: {
                    ...DEFAULT_INDEX_SETTINGS,
                    ...settings,
                    indexLanguages: [lang, baseLang] as SupportedLanguage[],
                },
            });
        }
    }

    async release(): Promise<void> {
        if (this.workerPool) {
            const results = await this.workerPool.waitForCompletion();

            for (const [lang, records] of results.entries()) {
                this.objects[lang] = this.objects[lang] || [];
                this.objects[lang].push(...records);
            }

            await this.workerPool.terminate();
        }

        for (const lang of Object.keys(this.objects)) {
            if (this.apiLink) {
                await this.run.copy(
                    join(__dirname, '../client/search.js'),
                    join(this.run.output, this.apiLink),
                );
            }

            const page = await this.run.search.page(lang);
            await this.run.write(join(this.run.output, pageLink(lang)), page);

            const jsonPath = join(this.run.output, '_search', `${lang}-algolia.json`);
            await this.run.write(jsonPath, JSON.stringify(this.objects[lang], null, 2));

            this.logger.info(
                `Created local search index: ${this.createIndexName(lang)} - ${this.objects[lang].length} records`,
            );

            if (!this.index || !this.client) {
                continue;
            }

            const indexName = this.createIndexName(lang);
            await this.uploadRecordsToAlgolia(
                indexName,
                lang,
                this.objects[lang],
                ALGOLIA_METHODS.SAVE_OBJECTS,
            );
        }
    }

    config(lang: string) {
        return {
            provider: 'algolia',
            api: this.apiLink,
            link: pageLink(lang),
            appId: this.appId,
            indexName: this.createIndexName(lang),
            searchApiKey: this.searchApiKey,
            querySettings: this.querySettings,
        };
    }

    private createIndexName(lang: string): string {
        return `${this.indexName}-${lang}`;
    }

    private ensureClient(): Algoliasearch {
        return ensureClient(this.client);
    }

    private processDocumentSync(
        path: string,
        lang: string,
        html: string,
        title: string,
        meta: DocumentMeta,
    ): void {
        const records = processDocument({path, lang, html, title, meta});

        this.objects[lang] = this.objects[lang] || [];

        this.objects[lang].push(...records);
    }

    private async uploadRecordsToAlgolia(
        indexName: string,
        lang: string,
        records: AlgoliaRecord[],
        method: AlgoliaMethod = ALGOLIA_METHODS.REPLACE_ALL_OBJECTS,
    ): Promise<void> {
        const client = ensureClient(this.client);
        await uploadRecordsToAlgolia(
            client,
            indexName,
            lang,
            records,
            method,
            DEFAULT_INDEX_SETTINGS,
            this.indexSettings,
            this.logger,
        );
    }
}
