#!/usr/bin/env node
const { readFileSync } = require('node:fs');
const path = require('node:path');

try {
  // Read the Next.js compiled page module which already includes the listGames import.
  const bundlePath = path.join(process.cwd(), '.next', 'server', 'app', 'games', 'page.js');
  const source = readFileSync(bundlePath, 'utf8');
  const Module = module.constructor;
  const m = new Module(bundlePath, module);
  m.filename = bundlePath;
  m.paths = Module._nodeModulePaths(path.dirname(bundlePath));
  m._compile(source, bundlePath);
  const listGames = m.exports.listGames ?? m.exports.default?.listGames;
  if (typeof listGames !== 'function') {
    console.error('Could not locate listGames in compiled bundle');
    process.exit(1);
  }
  (async () => {
    const games = await listGames();
    console.log(JSON.stringify(games, null, 2));
  })();
} catch (err) {
  console.error(err);
  process.exit(1);
}
