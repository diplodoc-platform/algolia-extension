import type {
    AlgoliaRecord,
    DocumentMeta,
    ErrorMessage,
    ProcessMessage,
    ResultMessage,
    WorkerMessage,
} from '../types';

import {Worker as NodeWorker} from 'worker_threads';
import {join} from 'path';
import {LogLevel, Logger} from '@diplodoc/cli/lib/logger';

class WorkerPoolLogger extends Logger {
    worker = this.topic(LogLevel.INFO, 'WORKER_POOL');
}

export class AlgoliaWorkerPool {
    private workers: NodeWorker[] = [];
    private queue: ProcessMessage[] = [];
    private busyWorkers = new Set<NodeWorker>();
    private failure?: Error;
    private terminating = false;
    private readonly maxWorkers: number;
    private readonly workerPath: string;
    private results: Map<string, AlgoliaRecord[]> = new Map();
    private waiters: {
        resolve: (value: Map<string, AlgoliaRecord[]>) => void;
        reject: (error: Error) => void;
    }[] = [];
    private logger = new WorkerPoolLogger();

    constructor(maxWorkers = 4) {
        this.maxWorkers = Math.max(1, Math.min(maxWorkers, require('os').cpus().length - 1));
        this.workerPath = join(__dirname, 'processor.js');
    }

    initialize(): void {
        const fs = require('fs');
        if (!fs.existsSync(this.workerPath)) {
            throw new Error(`Worker file not found: ${this.workerPath}`);
        }

        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = this.createWorker();
            this.workers.push(worker);
        }
    }

    addTask(
        path: string,
        lang: string,
        html: string,
        title: string,
        meta: DocumentMeta,
        skipHtmlExtension?: boolean,
    ): void {
        if (this.failure) {
            throw this.failure;
        }

        const message: ProcessMessage = {
            type: 'process',
            data: {
                path,
                lang,
                html,
                title,
                meta: meta || {},
                skipHtmlExtension,
            },
        };

        this.queue.push(message);

        this.startProcessing();
    }

    async waitForCompletion(): Promise<Map<string, AlgoliaRecord[]>> {
        if (this.failure) {
            throw this.failure;
        }

        if (this.queue.length === 0 && this.busyWorkers.size === 0) {
            return this.results;
        }

        return new Promise<Map<string, AlgoliaRecord[]>>((resolve, reject) => {
            this.waiters.push({resolve, reject});
        });
    }

    async terminate(): Promise<void> {
        this.terminating = true;

        try {
            this.workers.forEach((worker) => {
                try {
                    worker.postMessage({type: 'terminate', data: null});
                } catch (error) {
                    this.logger.warn(`Error sending terminate message to worker:`, error);
                }
            });

            await new Promise((resolve) => setTimeout(resolve, 100));

            await Promise.all(this.workers.map((worker) => worker.terminate()));

            this.workers = [];
        } catch (error) {
            this.logger.error(`Error during worker pool termination:`, error);
            this.workers = [];
        }
    }

    private createWorker(): NodeWorker {
        const worker = new NodeWorker(this.workerPath);

        worker.on('message', (message: WorkerMessage) => {
            this.handleWorkerMessage(worker, message);
        });

        worker.on('error', (error) => {
            this.fail(error);
        });

        worker.on('exit', (code) => {
            if (!this.terminating) {
                this.fail(new Error(`Worker exited with code ${code}`));
            }
        });

        return worker;
    }

    private handleWorkerMessage(worker: NodeWorker, message: WorkerMessage): void {
        if (this.failure || this.terminating) {
            return;
        }

        this.busyWorkers.delete(worker);

        switch (message.type) {
            case 'result': {
                const resultMessage = message as ResultMessage;
                const records = resultMessage.data.records;

                for (const record of records) {
                    const lang = record.lang;
                    if (!this.results.has(lang)) {
                        this.results.set(lang, []);
                    }
                    const resultsForLang = this.results.get(lang);
                    if (resultsForLang) {
                        resultsForLang.push(record);
                    }
                }

                this.processNextItem(worker);
                break;
            }

            case 'error': {
                const errorMessage = message as ErrorMessage;
                this.fail(new Error(errorMessage.data.message));
                break;
            }

            default:
                this.fail(new Error(`Unknown message type: ${message.type}`));
        }

        this.checkCompletion();
    }

    private fail(error: unknown): void {
        if (this.failure || this.terminating) {
            return;
        }

        this.failure = error instanceof Error ? error : new Error(String(error));
        this.checkCompletion();
    }

    private processNextItem(worker: NodeWorker): void {
        if (this.failure || this.terminating || this.busyWorkers.has(worker)) {
            return;
        }

        if (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) {
                this.busyWorkers.add(worker);

                try {
                    worker.postMessage(task);
                } catch (error) {
                    this.fail(error);
                }
            }
        }
    }

    private startProcessing(): void {
        if (this.queue.length === 0) {
            return;
        }

        for (const worker of this.workers) {
            this.processNextItem(worker);
        }
    }

    private checkCompletion(): void {
        if (!this.failure && (this.queue.length > 0 || this.busyWorkers.size > 0)) {
            return;
        }

        for (const {resolve, reject} of this.waiters.splice(0)) {
            if (this.failure) {
                reject(this.failure);
            } else {
                resolve(this.results);
            }
        }
    }
}
