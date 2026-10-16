import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(resolve(root, 'deployments/conceito/public-config.json'), 'utf8'));
if (config.projectRef !== 'xkcxvbagzxwwauofvlin' ||
    config.supabaseUrl !== `https://${config.projectRef}.supabase.co` ||
    !config.publishableKey.startsWith('sb_publishable_')) {
  throw new Error('Configuração pública do Colégio Conceito inválida');
}
execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'conceito', '--outDir', 'dist-conceito'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_SUPABASE_PROJECT_ID: config.projectRef,
    VITE_SUPABASE_URL: config.supabaseUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
    VITE_SCHOOL_NAME: config.schoolName,
    VITE_SCHOOL_TIME_ZONE: config.timeZone,
  },
});
