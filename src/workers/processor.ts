import {parentPort} from 'worker_threads';

import {AlgoliaRecord, ErrorMessage, ProcessMessage, ResultMessage, WorkerMessage} from '../types';
import {processDocument} from '../core/document-processor';

if (!parentPort) {
    throw new Error('This file should be run as a worker thread');
}

function sendResult(records: AlgoliaRecord[]): void {
    const resultMessage: ResultMessage = {
        type: 'result',
        data: {records},
    };
    if (parentPort) {
        parentPort.postMessage(resultMessage);
    }
}

function sendError(error: unknown): void {
    const errorMessage: ErrorMessage = {
        type: 'error',
        data: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        },
    };
    if (parentPort) {
        parentPort.postMessage(errorMessage);
    }
}

process.on('uncaughtException', (error) => {
    sendError(error);
});

process.on('unhandledRejection', (reason) => {
    sendError(new Error(`Unhandled promise rejection: ${reason}`));
});

parentPort.on('message', (message: WorkerMessage): void => {
    try {
        if (message.type === 'terminate') {
            process.exit(0);
            return;
        }

        if (message.type === 'process') {
            const processMessage = message as ProcessMessage;
            const {path, lang, html, title, meta} = processMessage.data;

            if (meta.noIndex) {
                sendResult([]);
                return;
            }

            const records = processDocument({path, lang, html, title, meta});
            sendResult(records);
        }
    } catch (error) {
        sendError(error);
    }
});
