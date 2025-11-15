#!/usr/bin/env node
/**
 * @fileoverview Backend-local proxy for the Dash lifecycle helper.
 *
 * PURPOSE
 * -------
 * Allows developers who are working from the `backend/` directory to execute the
 * standard `node scripts/manage-dash.mjs` command without navigating back to the
 * repository root. The proxy simply re-invokes the root helper script, passing
 * along every CLI argument untouched.
 *
 * STRUCTURE
 * ---------
 * - Resolve the repository root relative to this file.
 * - Spawn a child Node.js process targeting the canonical helper script under
 *   `../scripts/manage-dash.mjs`.
 * - Pipe stdio through so logging and prompts behave exactly as they do when the
 *   root script is executed directly.
 *
 * USAGE
 * -----
 * Execute from the backend folder just as you would from the root:
 *   node scripts/manage-dash.mjs setup --db-uri "mongodb://localhost:27017/dash"
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootManageScript = resolve(__dirname, '../../scripts/manage-dash.mjs');

const child = spawn(process.argv[0], [rootManageScript, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32'
});

child.on('exit', code => {
  process.exit(code ?? 0);
});

child.on('error', error => {
  console.error('Unable to delegate to the root manage script.', error);
  process.exit(1);
});
