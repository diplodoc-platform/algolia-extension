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

    logger.info(`Uploading to Algolia: ${indexName} - ${records.length} records`);

    try {
        await client.setSettings({
            indexName,
            indexSettings: {
                ...defaultSettings,
                ...indexSettings,
                indexLanguages: uniq([lang, baseLang]) as SupportedLanguage[],
            },
        });

        const result = await client[method]({
            indexName,
            objects: records as unknown as Record<string, unknown>[],
        });

        const taskIDs = findTaskIDs(result);

        if (taskIDs.length > 0) {
            await Promise.all(
                taskIDs.map((taskID) =>
                    client
                        .waitForTask({indexName, taskID})
                        .catch((error) =>
                            logger.warn(
                                `Error waiting for task ${taskID}: ${error instanceof Error ? error.message : String(error)}`,
                            ),
                        ),
                ),
            );
        } else {
            logger.warn(`No taskID found in response for index ${indexName}`);
        }

        logger.info(
            `Successfully uploaded to Algolia: ${indexName} (${lang}) - ${records.length} records`,
        );
    } catch (error) {
        logger.error(`Error updating index ${indexName}:`, error);
        throw error;
    }
}

function findTaskIDs(obj: unknown): number[] {
    if (!obj || typeof obj !== 'object') return [];

    const result: number[] = [];
    const objRecord = obj as Record<string, unknown>;

    if ('taskID' in objRecord && typeof objRecord.taskID === 'number') {
        result.push(objRecord.taskID);
    }

    Object.values(objRecord).forEach((value) => {
        if (Array.isArray(value)) {
            value.forEach((item) => result.push(...findTaskIDs(item)));
        } else if (value && typeof value === 'object') {
            result.push(...findTaskIDs(value));
        }
    });

    return result;
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
