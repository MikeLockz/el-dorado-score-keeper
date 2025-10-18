#!/usr/bin/env node
/**
 * Export IndexedDB data from a raw Chromium IndexedDB directory by
 * bootstrapping a headless Chromium instance that reuses the database files.
 *
 * Steps:
 *   1. Copies the provided IndexedDB LevelDB + blob directories into a fresh
 *      Chromium user profile.
 *   2. Serves a minimal page on http://localhost:3010 that enumerates all
 *      databases/stores and pulls every record (key + value) via the native
 *      IndexedDB API.
 *   3. Writes the resulting export to JSON/CSV files in `temp/<timestamp>/`.
 *
 * Usage:
 *   node scripts/tools/export-indexeddb.mjs [path-to-idb-dump-dir]
 */

import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const SOURCE_ROOT = path.resolve(process.argv[2] ?? 'temp/http_localhost_3000');
const EXPORT_PORT = Number(process.env.INDEXEDDB_EXPORT_PORT ?? 3010);
const EXPORT_ORIGIN = `http://localhost:${EXPORT_PORT}/`;

async function main() {
  const levelDbDir = path.join(SOURCE_ROOT, 'http_localhost_3000.indexeddb.leveldb');
  const blobDir = path.join(SOURCE_ROOT, 'http_localhost_3000.indexeddb.blob');

  await ensureExists(levelDbDir, 'LevelDB directory');
  await ensureExists(blobDir, 'blob directory');

  const profileDir = await prepareProfileDirectory(levelDbDir, blobDir);
  const server = await startServer();

  let browserContext;
  try {
    browserContext = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1280, height: 720 },
    });

    const page = await browserContext.newPage();
    await page.goto(EXPORT_ORIGIN, {
      waitUntil: 'load',
    });

    const exportResult = await page.evaluate(async () => {
      if (!('indexedDB' in self)) {
        throw new Error('IndexedDB is not available in this environment.');
      }

      const getDatabases = async () => {
        if (indexedDB.databases) {
          return indexedDB.databases();
        }
        throw new Error('indexedDB.databases() not supported in this browser.');
      };

      const databases = await getDatabases();
      const results = [];

      for (const info of databases) {
        if (!info?.name) continue;
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(info.name, info.version);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });

        const objectStores = {};
        for (const storeName of Array.from(db.objectStoreNames)) {
          objectStores[storeName] = await dumpStore(db, storeName);
        }

        results.push({
          name: db.name,
          version: db.version,
          objectStores,
        });

        db.close();
      }

      return results;

      // Helpers defined below so they can close over the same scope.

      function dumpStore(db, storeName) {
        return new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);

          const meta = {
            keyPath: store.keyPath,
            autoIncrement: store.autoIncrement,
            indexes: Array.from(store.indexNames).map((name) => {
              const index = store.index(name);
              return {
                name: index.name,
                keyPath: index.keyPath,
                unique: index.unique,
                multiEntry: index.multiEntry,
              };
            }),
          };

          const rows = [];
          tx.oncomplete = () => resolve({ meta, rows });
          tx.onerror = () => reject(tx.error ?? new Error('Failed to read object store'));
          tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));

          const cursorRequest = store.openCursor();
          cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Cursor failed'));
          cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) return;
            rows.push({
              key: cursor.key,
              value: cursor.value,
            });
            cursor.continue();
          };
        });
      }
    });

    const outputDir = await prepareOutputDirectory();
    await persistExport(outputDir, exportResult);
    console.log(`IndexedDB export written to: ${outputDir}`);
  } finally {
    await browserContext?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function ensureExists(targetPath, label) {
  const exists = await fsp
    .access(targetPath, fs.constants.R_OK)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

async function prepareProfileDirectory(levelDbDir, blobDir) {
  const profileDir = path.join(os.tmpdir(), `idb-export-profile-${Date.now()}`);
  const idbTargetDir = path.join(profileDir, 'Default', 'IndexedDB');

  await fsp.rm(profileDir, { recursive: true, force: true });
  await fsp.mkdir(idbTargetDir, { recursive: true });

  await fsp.cp(levelDbDir, path.join(idbTargetDir, path.basename(levelDbDir)), {
    recursive: true,
  });
  await fsp.cp(blobDir, path.join(idbTargetDir, path.basename(blobDir)), {
    recursive: true,
  });

  return profileDir;
}

async function startServer() {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>IndexedDB Export Helper</title>
  </head>
  <body>
    <script>
      // The actual export logic lives in page.evaluate; this document only
      // exists to give Chromium a matching origin (http://localhost:3000).
    </script>
  </body>
</html>`;

  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(EXPORT_PORT, resolve);
  });

  return server;
}

async function prepareOutputDirectory() {
  const timestamp = formatTimestamp(new Date());
  const baseDir = path.resolve(path.dirname(SOURCE_ROOT));
  const outputDir = path.join(baseDir, timestamp);
  await fsp.mkdir(outputDir, { recursive: true });
  return outputDir;
}

async function persistExport(outputDir, exportResult) {
  await fsp.rm(outputDir, { recursive: true, force: true });
  await fsp.mkdir(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'indexeddb.json');
  await fsp.writeFile(jsonPath, JSON.stringify(exportResult, null, 2), 'utf8');

  // Emit convenience JSONL files: one per database + store.
  for (const db of exportResult) {
    for (const [storeName, storeDump] of Object.entries(db.objectStores)) {
      const fileName = `${sanitize(db.name)}__${sanitize(storeName)}.jsonl`;
      const filePath = path.join(outputDir, fileName);

      const lines = storeDump.rows.map((entry) => JSON.stringify(entry));
      await fsp.writeFile(filePath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');

      const csvName = `${sanitize(db.name)}__${sanitize(storeName)}.csv`;
      const csvPath = path.join(outputDir, csvName);
      const csvLines = ['key,value'];
      for (const entry of storeDump.rows) {
        csvLines.push(`${toCsvCell(entry.key)},${toCsvCell(entry.value)}`);
      }
      await fsp.writeFile(csvPath, csvLines.join('\n') + (csvLines.length ? '\n' : ''), 'utf8');
    }
  }
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

function toCsvCell(value) {
  let text;
  if (value === null || value === undefined) {
    text = '';
  } else if (typeof value === 'string') {
    text = value;
  } else {
    text = JSON.stringify(value);
  }

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return String(text);
}

function formatTimestamp(date) {
  const pad = (num) => String(num).padStart(2, '0');
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes())
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
