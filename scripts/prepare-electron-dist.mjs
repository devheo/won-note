import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stageRoot = path.join(repoRoot, 'electron-dist');
const tauriConfig = JSON.parse(await fs.readFile(path.join(repoRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'));

await fs.rm(stageRoot, { recursive: true, force: true });
await fs.mkdir(path.join(stageRoot, 'electron'), { recursive: true });
await fs.mkdir(path.join(stageRoot, 'dist'), { recursive: true });
await fs.mkdir(path.join(stageRoot, 'assets'), { recursive: true });

await Promise.all([
  fs.copyFile(path.join(repoRoot, 'electron', 'main.cjs'), path.join(stageRoot, 'electron', 'main.cjs')),
  fs.copyFile(path.join(repoRoot, 'electron', 'preload.cjs'), path.join(stageRoot, 'electron', 'preload.cjs')),
  fs.copyFile(path.join(repoRoot, 'electron-builder.json'), path.join(stageRoot, 'electron-builder.json')),
  fs.copyFile(path.join(repoRoot, 'dist', 'index.html'), path.join(stageRoot, 'dist', 'index.html')),
  fs.copyFile(path.join(repoRoot, 'src-tauri', 'icons', 'icon.ico'), path.join(stageRoot, 'assets', 'app.ico')),
  fs.writeFile(path.join(stageRoot, 'package.json'), JSON.stringify({
    name: 'wonnote-electron',
    productName: 'WON 노트 (WonNote)',
    version: tauriConfig.version,
    description: 'WON 노트 데스크톱 애플리케이션',
    author: 'WonNote',
    private: true,
    main: 'electron/main.cjs',
  }, null, 2)),
]);

console.log(`Electron Windows package staging prepared: ${stageRoot}`);
