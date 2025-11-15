#!/usr/bin/env node
/**
 * @fileoverview Dash lifecycle helper script (mini README).
 *
 * PURPOSE
 * -------
 * Provide a single, cross-platform entry point for preparing and launching the Dash
 * platform. The script encapsulates the one-time setup workflow (installing
 * dependencies and preparing environment variables) and the repeatable startup
 * tasks for development or production modes.
 *
 * STRUCTURE
 * ---------
 * - Argument parsing converts CLI flags into a normalized options object.
 * - High-level actions (`handleSetup`, `handleStart`) orchestrate the workflow.
 * - Shared helpers (`runCommand`, `ensureEnvConfig`, logging utilities) handle
 *   process execution, environment file management, and debug-friendly logging.
 *
 * USAGE EXAMPLES
 * --------------
 * node scripts/manage-dash.mjs setup --db-uri "mongodb://localhost:27017/dash"
 * node scripts/manage-dash.mjs start --mode dev --port 3100
 * node scripts/manage-dash.mjs start --mode prod --port 4000 --init-db
 *
 * KEY FILES & LOGGING
 * -------------------
 * - Writes logs to ./logs/manage-dash.log for troubleshooting.
 * - Ensures backend/.env exists (copying from backend/.env.example if needed) and
 *   auto-generates a secure JWT secret when missing or left as the placeholder.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const BACKEND_DIR = resolve(ROOT_DIR, 'backend');
const ENV_PATH = resolve(BACKEND_DIR, '.env');
const ENV_EXAMPLE_PATH = resolve(BACKEND_DIR, '.env.example');
const LOG_DIR = resolve(ROOT_DIR, 'logs');
const LOG_PATH = resolve(LOG_DIR, 'manage-dash.log');

/** Timestamped console + file logger for consistent diagnostics. */
function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  appendToLog(`${line}\n`);
}

function appendToLog(content) {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
  appendFileSync(LOG_PATH, content, { encoding: 'utf8' });
}

/** Write raw process output to both stdout/stderr and the log file. */
function logProcessStream(stream, prefix = '', target = process.stdout) {
  stream.on('data', chunk => {
    const text = chunk.toString();
    target.write(text);
    const lines = text.split(/\r?\n/).filter(Boolean);
    lines.forEach(line => appendToLog(`${prefix}${line}\n`));
  });
}

/** Execute an external command with inherit-style streaming and logging. */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const display = `${command} ${args.join(' ')}`.trim();
    log(`Running command: ${display}`);
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT_DIR,
      env: options.env || process.env,
      shell: process.platform === 'win32',
      stdio: ['inherit', 'pipe', 'pipe']
    });

    logProcessStream(child.stdout);
    logProcessStream(child.stderr, '[stderr] ', process.stderr);

    child.on('error', err => {
      log(`Process error: ${err.message}`);
      reject(err);
    });

    child.on('close', code => {
      if (code === 0) {
        log(`Command succeeded: ${display}`);
        resolve();
      } else {
        const error = new Error(`Command failed with exit code ${code}: ${display}`);
        log(error.message);
        reject(error);
      }
    });
  });
}

/**
 * Probe for the MongoDB server binary and emit actionable guidance when it is missing.
 *
 * The setup script cannot install MongoDB automatically, so we surface an
 * easy-to-follow message for Windows and Linux / Raspberry Pi users. Returning a
 * boolean allows callers to decide whether the absence should be fatal or only a
 * warning (for example when connecting to a remote cluster).
 */
function reportMongoBinaryPresence() {
  const probe = spawnSync('mongod', ['--version'], {
    shell: process.platform === 'win32',
    env: process.env,
    encoding: 'utf8'
  });

  if (probe.error || probe.status !== 0) {
    log('MongoDB server binary (mongod) not detected on PATH.');
    const windowsHelp = 'Install MongoDB Community Server from https://www.mongodb.com/try/download/community '
      + 'or run "docker run -d --name mongo -p 27017:27017 mongo:6" via Docker Desktop.';
    const linuxHelp = 'Install MongoDB using your package manager (e.g. "sudo apt install mongodb"), '
      + 'or run "docker run -d --name mongo -p 27017:27017 mongo:6" if Docker is available.';
    const guidance = process.platform === 'win32' ? windowsHelp : linuxHelp;
    log(guidance);
    return false;
  }

  const combinedOutput = `${probe.stdout}${probe.stderr}`;
  const versionLine = combinedOutput
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.toLowerCase().includes('db version'));
  if (versionLine) {
    log(`Confirmed MongoDB availability: ${versionLine}`);
  } else {
    log('Confirmed MongoDB availability via "mongod --version".');
  }
  return true;
}

/** Parse CLI arguments into command + options. */
function parseArguments(argv) {
  const args = [...argv];
  let command = 'start';
  if (args.length > 0 && !args[0].startsWith('--')) {
    command = args.shift();
  }

  const options = {
    mode: 'dev',
    port: null,
    dbUri: null,
    skipInstall: false,
    initDb: false,
    help: false
  };

  while (args.length > 0) {
    const raw = args.shift();
    switch (raw) {
      case '--mode':
        options.mode = (args.shift() || '').toLowerCase();
        break;
      case '--mode=dev':
      case '--mode=prod':
        options.mode = raw.split('=')[1];
        break;
      case '--port':
        options.port = Number(args.shift());
        break;
      default:
        if (raw.startsWith('--port=')) {
          options.port = Number(raw.split('=')[1]);
        } else if (raw === '--db-uri') {
          options.dbUri = args.shift() || null;
        } else if (raw.startsWith('--db-uri=')) {
          options.dbUri = raw.split('=')[1];
        } else if (raw === '--skip-install') {
          options.skipInstall = true;
        } else if (raw === '--init-db') {
          options.initDb = true;
        } else if (raw === '--help' || raw === '-h') {
          options.help = true;
        } else {
          log(`Unknown option ignored: ${raw}`);
        }
    }
  }

  return { command, options };
}

function showHelp() {
  console.log(`Dash manage script\n\nUsage:\n  node scripts/manage-dash.mjs <command> [options]\n\nCommands:\n  setup        Install dependencies and prepare backend/.env.\n  start        Launch the backend API (default command).\n\nOptions:\n  --mode <dev|prod>   Development (nodemon) or production build/start. Default: dev.\n  --port <number>     Preferred port for the backend (overrides PORT env).\n  --db-uri <string>   Update backend/.env with a MongoDB connection string.\n  --skip-install      Skip npm install during setup/start.\n  --init-db           Run the database initialisation script after setup/start.\n  --help, -h          Display this message.\n`);
}

/** Ensure backend/.env exists and is populated appropriately. */
function ensureEnvConfig(dbUri) {
  if (!existsSync(ENV_PATH)) {
    if (!existsSync(ENV_EXAMPLE_PATH)) {
      throw new Error('backend/.env is missing and backend/.env.example is not available.');
    }
    log('backend/.env not found. Creating from backend/.env.example.');
    const example = readFileSync(ENV_EXAMPLE_PATH, 'utf8');
    writeFileSync(ENV_PATH, example, 'utf8');
  }

  let envContent = readFileSync(ENV_PATH, 'utf8');
  let updated = false;

  if (dbUri) {
    const sanitizedUri = dbUri.trim();
    envContent = upsertEnvValue(envContent, 'DB_URI', sanitizedUri);
    updated = true;
    log(`Updated DB_URI in backend/.env to ${sanitizedUri}`);
  }

  const secretMatch = envContent.match(/^JWT_SECRET=(.*)$/m);
  const currentSecret = secretMatch ? secretMatch[1].trim() : '';
  if (!currentSecret || currentSecret.toLowerCase() === 'changeme') {
    const newSecret = crypto.randomBytes(48).toString('base64');
    envContent = upsertEnvValue(envContent, 'JWT_SECRET', newSecret);
    updated = true;
    log('Generated secure JWT_SECRET and stored it in backend/.env');
  } else {
    log('Existing JWT_SECRET detected; leaving unchanged.');
  }

  if (updated) {
    writeFileSync(ENV_PATH, normalizeNewlines(envContent), 'utf8');
  }
}

function normalizeNewlines(text) {
  return text.replace(/\r?\n/g, '\n');
}

function upsertEnvValue(content, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, `${key}=${value}`);
  }
  const separator = content.endsWith('\n') ? '' : '\n';
  return `${content}${separator}${key}=${value}\n`;
}

async function handleSetup(options) {
  log('Starting Dash setup sequence.');
  const hasMongo = reportMongoBinaryPresence();
  if (!hasMongo) {
    log('Continuing setup; database-dependent commands will fail until MongoDB is installed or an external cluster is configured.');
  }
  ensureEnvConfig(options.dbUri);
  if (!options.skipInstall) {
    await runCommand('npm', ['install']);
  } else {
    log('Skipping npm install as requested.');
  }
  if (options.initDb) {
    await runCommand('npm', ['run', 'db:init', '--prefix', 'backend']);
  }
  log('Setup sequence complete.');
}

async function handleStart(options) {
  log(`Starting Dash backend in ${options.mode} mode.`);
  const hasMongo = reportMongoBinaryPresence();
  if (!hasMongo) {
    log('Backend start will proceed, but expect connection failures unless DB_URI targets a reachable MongoDB instance.');
  }
  ensureEnvConfig(options.dbUri);
  if (!options.skipInstall && !existsSync(resolve(ROOT_DIR, 'node_modules'))) {
    log('Node modules missing; installing before launch.');
    await runCommand('npm', ['install']);
  } else if (!options.skipInstall) {
    log('Dependencies already installed; skipping npm install.');
  } else {
    log('Skipping dependency installation prior to start.');
  }

  const env = { ...process.env };
  if (options.port) {
    env.PORT = String(options.port);
    log(`Will request backend port ${options.port}.`);
  }

  if (options.mode === 'prod' || options.mode === 'production') {
    env.NODE_ENV = 'production';
    await runCommand('npm', ['run', 'build', '--prefix', 'backend'], { env });
    await runCommand('npm', ['start', '--prefix', 'backend'], { env });
  } else if (options.mode === 'dev' || options.mode === 'development') {
    env.NODE_ENV = 'development';
    await runCommand('npm', ['run', 'dev', '--prefix', 'backend'], { env });
  } else {
    throw new Error(`Unknown mode: ${options.mode}. Use dev or prod.`);
  }

  if (options.initDb) {
    await runCommand('npm', ['run', 'db:init', '--prefix', 'backend'], { env });
  }
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));

  if (options.help) {
    showHelp();
    return;
  }

  try {
    switch (command) {
      case 'setup':
        await handleSetup(options);
        break;
      case 'start':
        await handleStart(options);
        break;
      default:
        log(`Unknown command: ${command}`);
        showHelp();
        process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Fatal error: ${message}`);
    process.exitCode = 1;
  }
}

main();
