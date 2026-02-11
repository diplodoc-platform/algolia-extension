#!/usr/bin/env node

/**
 * Cross-platform cleanup for build artifacts.
 * Avoid `rm -rf` in npm scripts because CI runs on Windows.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'dist');
if (fs.existsSync(dir)) {
    fs.rmSync(dir, {force: true, recursive: true});
}
