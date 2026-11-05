import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// O TEMP isolado também funciona no sandbox Windows, onde o diretório padrão restringe renomeações.
const temp = resolve('.cache', 'test-tmp');
mkdirSync(temp, { recursive: true });
const result = spawnSync(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, TEMP: temp, TMP: temp },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
