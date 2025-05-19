import type {
    Algoliasearch,
    IndexSettings,
    SupportedLanguage,
} from "algoliasearch";

import { algoliasearch } from "algoliasearch";
import { uniq } from "lodash";
import { html2text } from "@diplodoc/search-extension/indexer";
import { load } from "cheerio";
import { BuildRun, LogLevel, Logger } from "@diplodoc/cli";
import { join } from "path";

export type ProviderConfig = {
    appId: string;
    apiKey?: string;
    searchKey: string;
    indexName: string;
    indexSettings?: Partial<IndexSettings>;
    index?: boolean;
    uploadDuringBuild?: boolean;
};

export type IndexRecord = {
    objectID: string;
    title: string;
    content: string;
    headings: string[];
    keywords: string[];
    anchor?: string;
    url: string;
    lang: string;
    section?: string;
};

class IndexLogger extends Logger {
    index = this.topic(LogLevel.INFO, "INDEX");
}

export class AlgoliaProvider {
    private index: boolean;
    private uploadDuringBuild: boolean;
    private appId: string;
    private apiKey?: string;
    private searchKey: string;
    private indexPrefix: string;
    private indexSettings: Partial<IndexSettings>;
    private objects: Record<string, IndexRecord[]> = {};
    private client?: Algoliasearch;
    private run: BuildRun;
    private logger = new IndexLogger();

    private defaultSettings: IndexSettings = {
        distinct: 1,
        attributeForDistinct: 'url',
    }

    constructor(run: BuildRun, config: ProviderConfig) {
        this.run = run;
        this.index = config.index !== false;
        this.uploadDuringBuild = config.uploadDuringBuild !== false;
        this.appId = config.appId;
        this.indexPrefix = config.indexName.replace('-{lang}', '');
        this.apiKey = config.apiKey;
        this.searchKey = config.searchKey;
        this.indexSettings = config.indexSettings || {};

        if (this.apiKey) {
            this.client = algoliasearch(this.appId, this.apiKey);
        }

        if (run?.logger) {
            this.logger.pipe(run.logger);
        }
    }

    async add(
        path: string,
        lang: string,
        info: { html?: string; title?: string; meta?: { noIndex?: boolean; keywords?: string[]; title?: string; description?: string } },
    ) {
        if (!info.html) {
            return;
        }

        const { title = "", meta = {} } = info;

        // Skip pages marked as noIndex
        if (meta.noIndex) {
            return;
        }

        const $ = load(info.html);
        const sections: { heading: string; content: string; anchor?: string }[] = [];
        let currentSection = { heading: "", content: "", anchor: ""};

        let mainHeading = ''
        // Process all elements to split into sections
        $("body")
            .children()
            .each((_, element) => {
                const $el = $(element);

                // If it's a heading, start a new section
                if ($el.is("h1, h2, h3, h4, h5, h6")) {
                    // Save previous section if it has content
                    if (currentSection.content.trim()) {
                        sections.push({ ...currentSection });
                    }

                    let headingText = ''
                    for (const el of $el.contents()) {
                        if (el.type === 'text') {
                            headingText = String(el.data)
                        } 
                    }

                    if (!headingText) {
                        headingText = $el.text().trim()
                    }

                    if (!mainHeading) {
                        mainHeading = headingText
                    }

                    currentSection = {
                        heading: headingText,
                        anchor: $el.attr('id') || '',
                        content: "",
                    };
                } else {
                    // Add content to current section
                    currentSection.content += $el.text().trim() + " ";
                }
            });

        // Add the last section if it has content
        if (currentSection.content.trim()) {
            sections.push({ ...currentSection });
        }

        this.objects[lang] = this.objects[lang] || [];

        // If no sections were found, create a single record
        if (sections.length === 0) {
            const record: IndexRecord = {
                objectID: path.replace(/\.\w+$/, ""),
                title: title || meta.title  || mainHeading || "",
                content: html2text(info.html).slice(0, 5000),
                headings: this.extractHeadings(info.html),
                anchor: '',
                keywords: meta.keywords || [],
                url: path.replace(/\.\w+$/, "") + ".html",
                lang,
            };

            // Check if record needs to be split
            if (this.getRecordSize(record) >= 10000) {
                this.splitAndAddLargeRecord(record, lang);
            } else {
                this.objects[lang].push(record);
            }
            return;
        }

        // Create records for each section
        sections.forEach((section, index) => {
            const record: IndexRecord = {
                objectID: `${path.replace(/\.\w+$/, "")}-${index}`,
                title: title || meta.title || mainHeading || "",
                content: section.content.trim(),
                headings: [section.heading],
                anchor: section.anchor,
                keywords: meta.keywords || [],
                url: path.replace(/\.\w+$/, "") + ".html",
                lang,
                section: section.heading || undefined,
            };

            // Check if record needs to be split
            if (this.getRecordSize(record) >= 9600) {
                this.splitAndAddLargeRecord(record, lang);
            } else {
                this.objects[lang].push(record);
            }
        });
    }


    async addObjects(): Promise<void> {
        if (!this.index || !this.uploadDuringBuild) {
            return;
        }

        const client = this.ensureClient();

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
            const records = JSON.parse(content) as IndexRecord[];

            const indexName = `${this.indexPrefix}-${lang}`;
            const baseLang = getBaseLang(lang);

            this.logger.info(
                `Name: ${indexName}, Lang: ${lang}, Records: ${records.length}`,
            );

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

            // Save objects to Algolia
            await client.replaceAllObjects({
                indexName,
                objects: records,
            });

            this.logger.info(
                `Index ${indexName} updated with ${records.length} records`,
            );
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

    async release() {
        for (const lang of Object.keys(this.objects)) {
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
            const baseLang = getBaseLang(lang);

            this.logger.info(
                `Name: ${indexName}, Lang: ${lang}, Records: ${this.objects[lang].length}`,
            );

            await this.client.setSettings({
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

            const tasks = await this.client.saveObjects({
                indexName,
                objects: this.objects[lang],
            });

            await Promise.all(
                tasks.map(async ({ taskID }) => {
                    return this.client?.waitForTask({
                        indexName,
                        taskID,
                    });
                }),
            );
        }
    }

    config(lang: string) {
        return {
            provider: "algolia",
            appId: this.appId,
            indexName: `${this.indexPrefix}-${lang}`,
            searchKey: this.searchKey,
        };
    }

    /**
     * Splits a large record into smaller chunks and adds them to the objects array
     * @param record The record to split
     * @param lang The language of the record
     * @returns void
     */
    private splitAndAddLargeRecord(record: IndexRecord, lang: string): void {
        const baseObjectID = record.objectID;
        const content = record.content;
        const chunkSize = 4000; // Approximate chunk size in characters
        const chunks = Math.ceil(content.length / chunkSize);

        for (let i = 0; i < chunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, content.length);
            const chunkContent = content.slice(start, end);

            const chunkRecord: IndexRecord = {
                ...record,
                objectID: `${baseObjectID}-chunk-${i + 1}`,
                content: chunkContent,
            };

            this.objects[lang].push(chunkRecord);
        }
    }

    private ensureClient(): Algoliasearch {
        if (!this.client) {
            throw new Error(
                "Algolia client not initialized. Please provide an API key.",
            );
        }
        return this.client;
    }

    private extractHeadings(html: string): string[] {
        const $ = load(html);
        const headings: string[] = [];

        // Select all h1-h6 elements and extract their text
        $("h1, h2, h3, h4, h5, h6").each((_, element) => {
            // Get text content using contents() to handle nested elements properly
            const textPieces = $(element)
                .contents()
                .map((_, el) => $(el).text())
                .get();

            // Use Set to ensure uniqueness
            const uniqueText = [...new Set(textPieces)].join("").trim();

            if (uniqueText) {
                headings.push(uniqueText);
            }
        });

        return headings;
    }

    /**
     * Calculates the size of a record according to Algolia's specifications.
     * The size is determined by:
     * 1. Converting the record to a JSON string
     * 2. Removing extra spaces (spaces outside of key/value strings)
     * 3. Measuring the size of the resulting string
     * 
     * @param record The record to measure
     * @returns The size of the record in bytes
     */
    private getRecordSize(record: IndexRecord): number {
        // Convert to JSON string with minimal whitespace
        const jsonString = JSON.stringify(record);
        // Get the size in bytes (UTF-8 encoding)
        return Buffer.from(jsonString).length;
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
