import type {
    Algoliasearch,
    IndexSettings,
    SupportedLanguage,
} from "algoliasearch";
import { uniq } from "lodash";
import { LogLevel, Logger } from "@diplodoc/cli/lib/logger";
import { join } from "path";

export class IndexLogger extends Logger {
    index = this.topic(LogLevel.INFO, "INDEX");
}

export function getBaseLang(lang: string): string {
    if (["ru", "be", "kz", "ua"].includes(lang)) {
        return "ru";
    }

    return "en";
}

export function pageLink(lang: string): string {
    return join("_search", lang, `index.html`);
}

export function createIndexName(prefix: string, lang: string): string {
    return `${prefix}-${lang}`;
}

export async function uploadRecordsToAlgolia(
    client: Algoliasearch,
    indexName: string,
    lang: string,
    records: any[],
    method: 'replaceAllObjects' | 'saveObjects',
    defaultSettings: Partial<IndexSettings>,
    indexSettings: Partial<IndexSettings>,
    logger: IndexLogger
): Promise<void> {
    const baseLang = getBaseLang(lang);

    logger.info(
        `Name: ${indexName}, Lang: ${lang}, Records: ${records.length}`,
    );

    try {
        // Update index settings
        await client.setSettings({
            indexName,
            indexSettings: {
                ...defaultSettings,
                ...indexSettings,
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
            logger.warn(`Failed to get taskID for index ${indexName}. Skipping task completion wait.`);
        }

        logger.info(
            `Index ${indexName} updated with ${records.length} records`,
        );
    } catch (error) {
        logger.error(`Error updating index ${indexName}:`, error);
        throw error; // Rethrow error as this is a critical operation
    }
}

export function ensureClient(client?: Algoliasearch): Algoliasearch {
    if (!client) {
        throw new Error(
            "Algolia client not initialized. Please provide an API key.",
        );
    }
    return client;
}

export const DEFAULT_INDEX_SETTINGS: IndexSettings = {
    distinct: 1,
    attributeForDistinct: 'url',
};