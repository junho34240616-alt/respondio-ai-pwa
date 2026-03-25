import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const defaultEntries = [
  'src/services/auth.test.ts',
  'src/routes/api.smoke.test.ts',
  'mobile/app-shell/www/platformLoginHeuristics.test.js'
];

function resolveEntries() {
  const requested = process.argv.slice(2);
  return requested.length > 0 ? requested : defaultEntries;
}

async function compileEntry(tempRoot, entry) {
  const absEntry = path.resolve(repoRoot, entry);
  const normalizedEntry = entry.replace(/\\/g, '/');
  const outfile = path.join(
    tempRoot,
    normalizedEntry.replace(/\.[cm]?[jt]sx?$/, '.mjs')
  );

  await mkdir(path.dirname(outfile), { recursive: true });
  await build({
    entryPoints: [absEntry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    sourcemap: 'inline',
    logLevel: 'silent'
  });

  return outfile;
}

async function run() {
  const entries = resolveEntries();
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'respondio-node-tests-'));

  try {
    const compiledEntries = [];
    for (const entry of entries) {
      compiledEntries.push(await compileEntry(tempRoot, entry));
    }

    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--test', ...compiledEntries], {
        cwd: repoRoot,
        stdio: 'inherit'
      });

      child.on('error', reject);
      child.on('close', (code, signal) => {
        if (signal) {
          reject(new Error(`테스트 프로세스가 시그널 ${signal}로 종료되었습니다.`));
          return;
        }

        resolve(code ?? 1);
      });
    });

    process.exit(exitCode);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
