import { parentPort } from 'worker_threads';
import { ProcessMessage, ResultMessage, ErrorMessage, AlgoliaRecord } from '../types';
import { processDocument } from '../core/document-processor';

// Make sure parentPort exists
if (!parentPort) {
    throw new Error('This file should be run as a worker thread');
}

/**
 * Sends processing result to the main thread
 */
function sendResult(records: AlgoliaRecord[]): void {
    const resultMessage: ResultMessage = {
        type: 'result',
        data: { records }
    };
    parentPort!.postMessage(resultMessage);
}

/**
 * Sends error message to the main thread
 */
function sendError(error: unknown): void {
    const errorMessage: ErrorMessage = {
        type: 'error',
        data: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        }
    };
    parentPort!.postMessage(errorMessage);
}

// Message handler from the main thread
parentPort.on('message', (message: ProcessMessage) => {
    try {
        if (message.type !== 'process') {
            throw new Error(`Unexpected message type: ${message.type}`);
        }

        const { path, lang, html, title, meta } = message.data;

        // Skip pages marked as noIndex
        if (meta.noIndex) {
            sendResult([]);
            return;
        }

        // Process HTML and create records for the index using the common processor
        const records = processDocument({ path, lang, html, title, meta });
        
        // Send result back to the main thread
        sendResult(records);
    } catch (error) {
        // In case of error, send error message
        sendError(error);
    }
});