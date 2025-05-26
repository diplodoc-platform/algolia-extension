import type {Algoliasearch, IndexSettings, SupportedLanguage} from 'algoliasearch';

import {uniq} from 'lodash';
import {LogLevel, Logger} from '@diplodoc/cli/lib/logger';
import {join} from 'path';

import {AlgoliaRecord} from '../types';

export class IndexLogger extends Logger {
    index = this.topic(LogLevel.INFO, 'INDEX');
}

export function getBaseLang(lang: string): string {
    if (['ru', 'be', 'kz', 'ua'].includes(lang)) {
        return 'ru';
    }

    return 'en';
}

export function pageLink(lang: string): string {
    return join('_search', lang, `index.html`);
}

export function createIndexName(prefix: string, lang: string): string {
    return `${prefix}-${lang}`;
}

export async function uploadRecordsToAlgolia(
    client: Algoliasearch,
    indexName: string,
    lang: string,
    records: AlgoliaRecord[],
    method: 'replaceAllObjects' | 'saveObjects',
    defaultSettings: Partial<IndexSettings>,
    indexSettings: Partial<IndexSettings>,
    logger: IndexLogger,
): Promise<void> {
    const baseLang = getBaseLang(lang);

    logger.info(`Name: ${indexName}, Lang: ${lang}, Records: ${records.length}`);

    try {
        await client.setSettings({
            indexName,
            indexSettings: {
                ...defaultSettings,
                ...indexSettings,
                indexLanguages: uniq([lang, baseLang]) as SupportedLanguage[],
            },
        });

        const response = await client[method]({
            indexName,
            objects: records as unknown as Record<string, unknown>[],
        });

        if (response && 'taskID' in response && typeof response.taskID === 'number') {
            await client.waitForTask({
                indexName,
                taskID: response.taskID,
            });
        } else {
            logger.warn(
                `Failed to get taskID for index ${indexName}. Skipping task completion wait.`,
            );
        }

        logger.info(`Index ${indexName} updated with ${records.length} records`);
    } catch (error) {
        logger.error(`Error updating index ${indexName}:`, error);
        throw error;
    }
}

export function ensureClient(client?: Algoliasearch): Algoliasearch {
    if (!client) {
        throw new Error('Algolia client not initialized. Please provide an API key.');
    }
    return client;
}

export const DEFAULT_INDEX_SETTINGS: IndexSettings = {
    distinct: 1,
    attributeForDistinct: 'url',
};
