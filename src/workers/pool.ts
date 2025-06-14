import {Worker as NodeWorker} from 'worker_threads';
import {join} from 'path';
import {LogLevel, Logger} from '@diplodoc/cli/lib/logger';

import {
    AlgoliaRecord,
    DocumentMeta,
    ErrorMessage,
    ProcessMessage,
    ResultMessage,
    WorkerMessage,
} from '../types';

class WorkerPoolLogger extends Logger {
    worker = this.topic(LogLevel.INFO, 'WORKER_POOL');
}

export class AlgoliaWorkerPool {
    private workers: NodeWorker[] = [];
    private queue: ProcessMessage[] = [];
    private processing = false;
    private readonly maxWorkers: number;
    private readonly workerPath: string;
    private results: Map<string, AlgoliaRecord[]> = new Map();
    private resolvePromise: ((value: Map<string, AlgoliaRecord[]>) => void) | null = null;
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

    addTask(path: string, lang: string, html: string, title: string, meta: DocumentMeta): void {
        const message: ProcessMessage = {
            type: 'process',
            data: {
                path,
                lang,
                html,
                title,
                meta: meta || {},
            },
        };

        this.queue.push(message);

        if (!this.processing) {
            this.startProcessing();
        }
    }

    async waitForCompletion(): Promise<Map<string, AlgoliaRecord[]>> {
        if (this.queue.length === 0 && !this.processing) {
            return this.results;
        }

        return new Promise<Map<string, AlgoliaRecord[]>>((resolve) => {
            this.resolvePromise = resolve;
        });
    }

    async terminate(): Promise<void> {
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
            this.logger.error(`Worker error:`, error);
            this.replaceWorker(worker);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                this.logger.error(`Worker exited with code ${code}`);
                this.replaceWorker(worker);
            }
        });

        return worker;
    }

    private handleWorkerMessage(worker: NodeWorker, message: WorkerMessage): void {
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
                this.logger.error(`Processing error:`, errorMessage.data.message);
                this.processNextItem(worker);
                break;
            }

            default:
                this.logger.warn(`Unknown message type: ${message.type}`);
                this.processNextItem(worker);
        }

        this.checkCompletion();
    }

    private replaceWorker(oldWorker: NodeWorker): void {
        const index = this.workers.indexOf(oldWorker);
        if (index !== -1) {
            this.workers.splice(index, 1);

            const newWorker = this.createWorker();
            this.workers.push(newWorker);

            this.processNextItem(newWorker);
        }
    }

    private processNextItem(worker: NodeWorker): void {
        if (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) {
                try {
                    worker.postMessage(task);
                } catch (error) {
                    this.logger.error(`Error sending task to worker:`, error);
                    this.queue.unshift(task);
                    this.replaceWorker(worker);
                }
            }
        }
    }

    private startProcessing(): void {
        if (this.queue.length === 0) {
            return;
        }

        this.processing = true;

        for (const worker of this.workers) {
            this.processNextItem(worker);
        }
    }

    private checkCompletion(): void {
        if (this.queue.length === 0 && this.resolvePromise) {
            this.processing = false;
            this.resolvePromise(this.results);
            this.resolvePromise = null;
        }
    }
}
