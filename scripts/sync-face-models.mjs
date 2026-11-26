import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const sourceDir = path.join(rootDir, 'node_modules', '@vladmandic', 'human', 'models');
const targetDir = path.join(rootDir, 'public', 'models');

const REQUIRED_MODEL_FILES = [
  'models.json',
  'blazeface.json',
  'blazeface.bin',
  'facemesh.json',
  'facemesh.bin',
  'faceres.json',
  'faceres.bin',
  'antispoof.json',
  'antispoof.bin',
  'liveness.json',
  'liveness.bin',
];

if (!fs.existsSync(sourceDir)) {
  console.warn('[sync-face-models] Skipping: @vladmandic/human models not installed yet.');
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });

let totalBytes = 0;
for (const file of REQUIRED_MODEL_FILES) {
  const src = path.join(sourceDir, file);
  const dst = path.join(targetDir, file);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required face model file: ${src}`);
  }
  fs.copyFileSync(src, dst);
  totalBytes += fs.statSync(dst).size;
}

console.log(
  `[sync-face-models] Synced ${REQUIRED_MODEL_FILES.length} face model files (${(
    totalBytes /
    (1024 * 1024)
  ).toFixed(2)} MB) to public/models`
);
