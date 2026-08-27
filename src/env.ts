/**
 * Minimal .env loader (no dependency): reads KEY=VALUE lines from .env in the
 * repo root, without overriding variables already set in the shell.
 * Imported for its side effect at the top of every entrypoint.
 */

import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/,
    );
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}
