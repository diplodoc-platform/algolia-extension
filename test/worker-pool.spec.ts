import type {AlgoliaRecord} from '../src/types';

import {EventEmitter} from 'events';
import fs from 'fs';
import os from 'os';
import {Worker} from 'worker_threads';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {AlgoliaWorkerPool} from '../src/workers/pool';

vi.mock('worker_threads', () => ({Worker: vi.fn()}));

type TestWorker = EventEmitter & {
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
};

function complete(worker: TestWorker, path: string): void {
    const record: AlgoliaRecord = {
        objectID: path,
        url: path,
        title: path,
        content: 'Content',
        headings: [],
        keywords: [],
        lang: 'en',
    };

    worker.emit('message', {type: 'result', data: {records: [record]}});
}

describe('AlgoliaWorkerPool', () => {
    let pool: AlgoliaWorkerPool;
    let workers: TestWorker[];

    beforeEach(() => {
        workers = [];
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(os, 'cpus').mockReturnValue(new Array(3).fill({}));
        vi.mocked(Worker).mockImplementation(function () {
            const worker = Object.assign(new EventEmitter(), {
                postMessage: vi.fn(),
                terminate: vi.fn().mockResolvedValue(0),
            });

            workers.push(worker);

            return worker as unknown as Worker;
        });

        pool = new AlgoliaWorkerPool(2);
        pool.initialize();
    });

    afterEach(async () => {
        await pool.terminate();
        vi.restoreAllMocks();
    });

    it('resolves when all tasks finished before waiting', async () => {
        pool.addTask('first.md', 'en', '<p>Content</p>', 'First', {});
        complete(workers[0], 'first.md');

        await expect(pool.waitForCompletion()).resolves.toEqual(
            new Map([['en', [expect.objectContaining({objectID: 'first.md'})]]]),
        );
    }, 500);

    it('waits for every dispatched task when the queue is empty', async () => {
        pool.addTask('first.md', 'en', '<p>Content</p>', 'First', {});
        pool.addTask('second.md', 'en', '<p>Content</p>', 'Second', {});
        const completion = pool.waitForCompletion();
        let resolved = false;
        void completion.then(() => {
            resolved = true;
        });

        complete(workers[0], 'first.md');
        await new Promise((resolve) => setImmediate(resolve));
        expect(resolved).toBe(false);

        complete(workers[1], 'second.md');
        const results = await completion;

        expect(results.get('en')?.map((record) => record.objectID)).toEqual([
            'first.md',
            'second.md',
        ]);
    });

    it('dispatches a new task after workers become idle', async () => {
        pool.addTask('first.md', 'en', '<p>Content</p>', 'First', {});
        complete(workers[0], 'first.md');
        pool.addTask('second.md', 'en', '<p>Content</p>', 'Second', {});

        expect(workers[0].postMessage).toHaveBeenLastCalledWith(
            expect.objectContaining({data: expect.objectContaining({path: 'second.md'})}),
        );

        complete(workers[0], 'second.md');
        const results = await pool.waitForCompletion();

        expect(results.get('en')).toHaveLength(2);
    }, 500);

    it.each([false, true])(
        'rejects a worker failure with waiting=%s',
        async (waiting) => {
            pool.addTask('first.md', 'en', '<p>Content</p>', 'First', {});
            const completion = waiting ? pool.waitForCompletion() : undefined;
            const error = new Error('Worker failed');

            workers[0].emit('error', error);

            await expect(completion ?? pool.waitForCompletion()).rejects.toThrow(error);
        },
        500,
    );

    it.each([0, 1])(
        'rejects an unexpected worker exit with code %s',
        async (code) => {
            pool.addTask('first.md', 'en', '<p>Content</p>', 'First', {});
            const completion = pool.waitForCompletion();

            workers[0].emit('exit', code);

            await expect(completion).rejects.toThrow(/exited/);
        },
        500,
    );

    it('rejects a document processing error', async () => {
        pool.addTask('first.md', 'en', '<p>Content</p>', 'First', {});
        const completion = pool.waitForCompletion();

        workers[0].emit('message', {type: 'error', data: {message: 'Invalid document'}});

        await expect(completion).rejects.toThrow('Invalid document');
    });

    it('rejects a task that could not be sent to a worker', async () => {
        workers[0].postMessage.mockImplementationOnce(() => {
            throw new Error('Cannot send task');
        });
        pool.addTask('first.md', 'en', '<p>Content</p>', 'First', {});

        await expect(pool.waitForCompletion()).rejects.toThrow('Cannot send task');
    }, 500);

    it('does not replace workers during termination', async () => {
        for (const worker of workers) {
            worker.terminate.mockImplementation(async () => {
                worker.emit('exit', 1);

                return 1;
            });
        }

        await pool.terminate();

        expect(workers).toHaveLength(2);
    });
});
