import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Preload .env.local and .env into process.env if present
for (const envFile of ['.env.local', '.env']) {
  const p = path.join(process.cwd(), envFile);
  if (fs.existsSync(p)) {
    try {
      const content = fs.readFileSync(p, 'utf-8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            const k = trimmed.slice(0, eq).trim();
            const v = trimmed.slice(eq + 1).trim();
            if (k && (!process.env[k] || process.env[k] === 'MY_GEMINI_API_KEY')) {
              process.env[k] = v;
            }
          }
        }
      });
    } catch {
      // ignore
    }
  }
}

const isTsxRunning =
  process.env.TSX_ACTIVE === '1' ||
  process.execArgv.some((arg) => arg.includes('tsx')) ||
  Boolean((process as any)[Symbol.for('tsx.ts-node')]);

if (!isTsxRunning) {
  const currentFile = fileURLToPath(import.meta.url);
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', currentFile, ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: { ...process.env, TSX_ACTIVE: '1' },
    }
  );

  const forwardSignal = (sig: NodeJS.Signals) => {
    if (child.pid) {
      try {
        process.kill(child.pid, sig);
      } catch {
        // process may have already exited
      }
    }
  };

  process.on('SIGTERM', () => forwardSignal('SIGTERM'));
  process.on('SIGINT', () => forwardSignal('SIGINT'));

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
} else {
  await import('./server-app.ts');
}
