#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

function usage() {
  console.log(`
WonNote workspace recovery

Usage:
  node scripts/restore-workspace.mjs <backup.json> [options]

Options:
  --current <file>   Current workspace JSON to merge (default: user_data.json)
  --out <file>       Write the merged recovery JSON (default: user_data.recovered.json)
  --server <url>     Server API base URL, e.g. http://10.131.171.98:3000/api
  --apply            Back up the server workspace, then PUT the merged workspace
  --help             Show this help

Without --apply, this script only writes a recovery JSON file. It never changes
the supplied backup or the current workspace.
`);
}

function parseArgs(args) {
  const options = { apply: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help') options.help = true;
    else if (arg === '--apply') options.apply = true;
    else if (['--current', '--out', '--server'].includes(arg)) {
      if (!args[i + 1]) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = args[++i];
    } else if (!arg.startsWith('-') && !options.backup) options.backup = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function readWorkspace(file) {
  const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tree) || !parsed.tables || typeof parsed.tables !== 'object') {
    throw new Error(`${file} is not a WonNote workspace JSON (expected tree and tables).`);
  }
  return parsed;
}

function mergeWorkspace(backup, current = {}) {
  const currentItems = new Map((current.tree || []).map((item) => [item.id, item]));
  const seen = new Set();
  const tree = backup.tree.map((backupItem) => {
    seen.add(backupItem.id);
    const currentItem = currentItems.get(backupItem.id);
    if (!currentItem) return backupItem;
    return {
      ...backupItem,
      ...currentItem,
      // Restore backed-up nesting if a prior sync flattened a node to the root.
      parentId: backupItem.parentId ?? currentItem.parentId ?? null,
      type: backupItem.type || currentItem.type,
    };
  });
  for (const item of current.tree || []) {
    if (!seen.has(item.id)) tree.push(item);
  }

  const merged = {
    ...backup,
    ...current,
    tree,
    tables: { ...(backup.tables || {}), ...(current.tables || {}) },
    documents: { ...(backup.documents || {}), ...(current.documents || {}) },
    exportedAt: Date.now(),
  };
  validateWorkspace(merged);
  return merged;
}

function validateWorkspace(workspace) {
  const ids = new Set();
  for (const item of workspace.tree) {
    if (!item?.id || ids.has(item.id)) throw new Error(`Duplicate or missing tree item ID: ${item?.id || '(empty)'}`);
    ids.add(item.id);
  }
  const folders = new Set(workspace.tree.filter((item) => item.type === 'folder').map((item) => item.id));
  for (const item of workspace.tree) {
    if (item.parentId && !folders.has(item.parentId)) {
      throw new Error(`Tree item ${item.id} points to missing/non-folder parent ${item.parentId}`);
    }
    if (item.type === 'table' && !workspace.tables[item.id]) {
      throw new Error(`Table tree item ${item.id} has no table data`);
    }
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${options?.method || 'GET'} ${url} failed: HTTP ${response.status}${body ? ` — ${body.slice(0, 300)}` : ''}`);
  }
  return response.json();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  if (!options.backup) return usage();
  if (options.apply && !options.server) throw new Error('--apply requires --server.');

  const backup = await readWorkspace(options.backup);
  let current = {};
  if (options.server) {
    const baseUrl = options.server.replace(/\/+$/, '');
    current = await fetchJson(`${baseUrl}/workspace`, { headers: { 'Cache-Control': 'no-cache' } });
  } else {
    const currentFile = options.current || 'user_data.json';
    try {
      current = await readWorkspace(currentFile);
    } catch (error) {
      if (options.current) throw error;
      console.warn(`Could not read local user_data.json; using the supplied backup only: ${error.message}`);
    }
  }

  const recovered = mergeWorkspace(backup, current);
  const output = path.resolve(options.out || 'user_data.recovered.json');
  await fs.writeFile(output, `${JSON.stringify(recovered, null, 2)}\n`, { flag: 'w' });
  console.log(`Recovery file: ${output}`);
  console.log(`Merged workspace: ${recovered.tree.filter((item) => item.type === 'folder').length} folders, ${Object.keys(recovered.tables).length} tables/boards, ${Object.keys(recovered.documents || {}).length} notes`);

  if (options.apply) {
    const baseUrl = options.server.replace(/\/+$/, '');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const serverBackup = path.resolve(`server-workspace-before-restore-${timestamp}.json`);
    await fs.writeFile(serverBackup, `${JSON.stringify(current, null, 2)}\n`, { flag: 'wx' });
    await fetchJson(`${baseUrl}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recovered),
    });
    console.log(`Server workspace restored. Pre-restore backup: ${serverBackup}`);
  }
}

main().catch((error) => {
  console.error(`Restore failed: ${error.message}`);
  process.exitCode = 1;
});
