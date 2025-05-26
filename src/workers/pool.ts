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

        // Define path to processor file
        // In development: src/workers/processor.js
        // In production: dist/workers/processor.js
        try {
            // Try to use relative path for development
            const devPath = join(__dirname, 'processor.js');
            require.resolve(devPath);
            this.workerPath = devPath;
        } catch {
            // If failed, use absolute path for production
            this.workerPath = join(process.cwd(), 'dist', 'workers', 'processor.js');
            this.logger.info(`Using worker path: ${this.workerPath}`);
        }
    }

    initialize(): void {
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
        await Promise.all(this.workers.map((worker) => worker.terminate()));
        this.workers = [];
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
                worker.postMessage(task);
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
