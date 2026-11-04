import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const execute = promisify(execFile);
let converting = false;
const script = `param([string]$InputFile, [string]$OutputFile)
$ErrorActionPreference = 'Stop'
$app = $null; $deck = $null; $security = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $security = $app.AutomationSecurity
  $app.AutomationSecurity = 3
  $deck = $app.Presentations.Open($InputFile, -1, 0, 0)
  $deck.SaveAs($OutputFile, 24)
} finally {
  if ($deck) { $deck.Close(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($deck) }
  if ($app) {
    if ($null -ne $security) { $app.AutomationSecurity = $security }
    if ($app.Presentations.Count -eq 0) { $app.Quit() }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
  }
}
`;

export async function convertLegacyPpt(data: Buffer): Promise<Buffer> {
  if (process.platform !== 'win32') throw new Error('구형 PPT 변환은 PowerPoint가 설치된 Windows 서버에서 지원됩니다.');
  if (!Buffer.isBuffer(data) || data.length > 50 * 1024 * 1024 || data.length < 8 || !data.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))) {
    throw new Error('유효한 50MB 이하의 .ppt 파일을 선택해주세요.');
  }
  if (converting) throw new Error('다른 PPT 파일을 변환하고 있습니다. 잠시 후 다시 시도해주세요.');
  converting = true;
  let dir: string | undefined;
  try {
    dir = await mkdtemp(path.join(os.tmpdir(), 'won-note-ppt-'));
    const input = path.join(dir, 'input.ppt'), output = path.join(dir, 'output.pptx'), ps = path.join(dir, 'convert.ps1');
    await writeFile(input, data); await writeFile(ps, script, 'utf8');
    await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps, '-InputFile', input, '-OutputFile', output], { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
    return await readFile(output);
  } catch {
    throw new Error('PPT 변환에 실패했습니다. PowerPoint 설치·활성화 및 파일 암호 여부를 확인하거나, PowerPoint에서 .pptx로 저장한 뒤 가져와주세요.');
  } finally {
    converting = false;
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
