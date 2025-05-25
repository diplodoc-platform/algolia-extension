import type {
    Algoliasearch,
    IndexSettings,
    SearchParamsObject,
    SupportedLanguage,
} from "algoliasearch";
import type { BuildRun, EntryInfo, SearchProvider } from "@diplodoc/cli";

import { algoliasearch } from "algoliasearch";
import { uniq } from "lodash";
import { LogLevel, Logger } from "@diplodoc/cli/lib/logger";
import { join } from "path";

import {
    AlgoliaProviderConfig,
    AlgoliaRecord
} from "../types";
import { processDocument } from "./document-processor";
import { AlgoliaWorkerPool } from "../workers/pool";

class IndexLogger extends Logger {
    index = this.topic(LogLevel.INFO, "INDEX");
}

export class AlgoliaProvider implements SearchProvider {
    private index: boolean;
    private uploadDuringBuild: boolean;
    private appId: string;
    private apiKey?: string;
    private searchKey: string;
    private indexPrefix: string;
    private indexSettings: Partial<IndexSettings>;
    private querySettings: Partial<SearchParamsObject>;
    private objects: Record<string, AlgoliaRecord[]> = {};
    private client?: Algoliasearch;
    private run: BuildRun;
    private logger = new IndexLogger();
    private apiLink: string;
    private workerPool?: AlgoliaWorkerPool;

    private defaultSettings: IndexSettings = {
        distinct: 1,
        attributeForDistinct: 'url',
    }

    constructor(run: BuildRun, config: AlgoliaProviderConfig) {
        this.run = run;
        this.index = config.index !== false;
        this.uploadDuringBuild = config.uploadDuringBuild !== false;
        
        // Check required parameters
        if (!config.appId) {
            this.logger.error('Algolia appId is not specified');
        }
        this.appId = config.appId;
        
        // Ensure that indexPrefix always has a value
        if (!config.indexName && !config.indexPrefix) {
            this.logger.warn('Index name (indexName) is not specified. Using default value "docs"');
        }
        
        this.indexPrefix = config.indexPrefix ||
            (config.indexName && config.indexName.includes('-{lang}')
                ? config.indexName.replace('-{lang}', '')
                : config.indexName || 'docs');
                
        this.logger.info(`Using index prefix: ${this.indexPrefix}`);
        
        this.apiKey = config.apiKey;
        this.searchKey = config.searchKey || 'search-api-key';
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
        
        // Initialize worker pool for parallel document processing
        try {
            this.workerPool = new AlgoliaWorkerPool();
            this.workerPool.initialize();
            this.logger.info('Worker pool successfully initialized');
        } catch (error) {
            this.logger.error('Error initializing worker pool:', error);
        }
    }

    async add(
        path: string,
        lang: string,
        info: EntryInfo,
    ) {
        if (!info.html) {
            return;
        }

        const { title = "", meta = {} } = info;

        // Skip pages marked as noIndex
        if (meta.noIndex) {
            return;
        }

        // Add task to worker pool for parallel processing
        if (this.workerPool) {
            this.workerPool.addTask(path, lang, info.html, title, meta);
        } else {
            // If worker pool is not initialized, use sequential processing
            this.processDocumentSync(path, lang, info.html, title, meta);
        }
    }

    /**
     * Synchronous document processing (used as a fallback)
     */
    private processDocumentSync(
        path: string,
        lang: string,
        html: string,
        title: string,
        meta: any
    ): void {
        // Use common document processing logic
        const records = processDocument({ path, lang, html, title, meta });
        
        // Initialize array for current language if it doesn't exist yet
        this.objects[lang] = this.objects[lang] || [];
        
        // Add all records to the array
        this.objects[lang].push(...records);
    }


    /**
     * Updates index settings and uploads records to Algolia
     * @param indexName Index name
     * @param lang Language
     * @param records Records to upload
     * @param method Upload method ('replaceAllObjects' or 'saveObjects')
     */
    private async uploadRecordsToAlgolia(
        indexName: string,
        lang: string,
        records: AlgoliaRecord[],
        method: 'replaceAllObjects' | 'saveObjects' = 'replaceAllObjects'
    ): Promise<void> {
        const client = this.ensureClient();
        const baseLang = getBaseLang(lang);

        this.logger.info(
            `Name: ${indexName}, Lang: ${lang}, Records: ${records.length}`,
        );

        try {
            // Update index settings
            await client.setSettings({
                indexName,
                indexSettings: {
                    ...this.defaultSettings,
                    ...this.indexSettings,
                    indexLanguages: uniq([
                        lang,
                        baseLang,
                    ]) as SupportedLanguage[],
                },
            });

            // Upload objects to Algolia
            const response = await client[method]({
                indexName,
                objects: records as unknown as Record<string, unknown>[],
            });
            
            // Check for taskID and wait for task completion
            if (response && (response as any).taskID) {
                await client.waitForTask({
                    indexName,
                    taskID: (response as any).taskID,
                });
            } else {
                this.logger.warn(`Failed to get taskID for index ${indexName}. Skipping task completion wait.`);
            }

            this.logger.info(
                `Index ${indexName} updated with ${records.length} records`,
            );
        } catch (error) {
            this.logger.error(`Error updating index ${indexName}:`, error);
            throw error; // Rethrow error as this is a critical operation
        }
    }

    async addObjects(): Promise<void> {
        if (!this.index || !this.uploadDuringBuild) {
            return;
        }

        // Find all language files in _search directory
        const searchDir = join(this.run.originalInput, "_search");
        const files = await this.run.glob("*-algolia.json", { cwd: searchDir });

        for (const file of files) {
            // Extract language from filename (e.g. en-algolia.json -> en)
            const langMatch = file.match(/^([a-z]{2})-algolia\.json$/);
            if (!langMatch) {
                continue;
            }

            const lang = langMatch[1];
            const filePath = join(searchDir, file);

            // Read the file content
            const content = await this.run.read(filePath);
            const records = JSON.parse(content) as AlgoliaRecord[];

            const indexName = `${this.indexPrefix}-${lang}`;
            
            // Upload records to Algolia
            await this.uploadRecordsToAlgolia(indexName, lang, records, 'replaceAllObjects');
        }
    }

    async clearIndex(): Promise<void> {
        if (!this.index || !this.uploadDuringBuild) {
            return;
        }

        const client = this.ensureClient();
        for (const lang of Object.keys(this.objects)) {
            const indexName = `${this.indexPrefix}-${lang}`;
            await client.clearObjects({ indexName });
        }
    }

    async setSettings(settings: Partial<IndexSettings>): Promise<void> {
        if (!this.index || !this.uploadDuringBuild) {
            return;
        }

        const client = this.ensureClient();
        for (const lang of Object.keys(this.objects)) {
            const indexName = `${this.indexPrefix}-${lang}`;
            const baseLang = getBaseLang(lang);

            await client.setSettings({
                indexName,
                indexSettings: {
                    ...this.defaultSettings,
                    ...settings,
                    indexLanguages: uniq([
                        lang,
                        baseLang,
                    ]) as SupportedLanguage[],
                },
            });
        }
    }

    async release(): Promise<void> {
        // If worker pool is used, wait for all tasks to complete
        if (this.workerPool) {
            const results = await this.workerPool.waitForCompletion();
            
            // Merge results from workers with the main object
            for (const [lang, records] of results.entries()) {
                this.objects[lang] = this.objects[lang] || [];
                this.objects[lang].push(...records);
            }
            
            // Terminate worker pool
            await this.workerPool.terminate();
        }
        
        for (const lang of Object.keys(this.objects)) {
            // Copy API file for Algolia search
            if (this.apiLink) {
                await this.run.copy(
                    join(__dirname, '../client/search.js'),
                    join(this.run.output, this.apiLink)
                );
            }
            
            const page = await this.run.search.page(lang);
            await this.run.write(join(this.run.output, pageLink(lang)), page);

            // Write JSON file for each language
            const jsonPath = join(
                this.run.output,
                "_search",
                `${lang}-algolia.json`,
            );
            await this.run.write(
                jsonPath,
                JSON.stringify(this.objects[lang], null, 2),
            );

            if (!this.index || !this.uploadDuringBuild || !this.client) {
                continue;
            }

            const indexName = `${this.indexPrefix}-${lang}`;
            
            // Upload records to Algolia
            await this.uploadRecordsToAlgolia(indexName, lang, this.objects[lang], 'saveObjects');
        }
    }

    config(lang: string) {
        return {
            provider: "algolia",
            api: this.apiLink,
            link: pageLink(lang),
            appId: this.appId,
            indexName: `${this.indexPrefix}-${lang}`,
            searchKey: this.searchKey,
            querySettings: this.querySettings,
        };
    }

    private ensureClient(): Algoliasearch {
        if (!this.client) {
            throw new Error(
                "Algolia client not initialized. Please provide an API key.",
            );
        }
        return this.client;
    }
}

// Helper functions
function getBaseLang(lang: string) {
    if (["ru", "be", "kz", "ua"].includes(lang)) {
        return "ru";
    }

    return "en";
}

function pageLink(lang: string) {
    return join("_search", lang, `index.html`);
}