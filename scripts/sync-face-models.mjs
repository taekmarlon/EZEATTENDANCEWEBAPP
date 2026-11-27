import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const sourceDir = path.join(rootDir, 'node_modules', '@vladmandic', 'human', 'models');
const customAssetsDir = path.join(rootDir, 'model-assets');
const targetDir = path.join(rootDir, 'public', 'models');

const HUMAN_PKG_MODEL_FILES = [
  'models.json',
  'blazeface.json',
  'blazeface.bin',
  'facemesh.json',
  'facemesh.bin',
  'antispoof.json',
  'antispoof.bin',
  'liveness.json',
  'liveness.bin',
];

const CUSTOM_ASSET_MODEL_FILES = [
  'mobilefacenet.json',
  'mobilefacenet.bin',
];

const DEPRECATED_FILES = [
  'facemesh-detection-full.json',
  'facemesh-detection-full.bin',
  'faceres.json',
  'faceres.bin',
];

if (!fs.existsSync(sourceDir)) {
  console.warn('[sync-face-models] Skipping: @vladmandic/human models not installed yet.');
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });

for (const stale of DEPRECATED_FILES) {
  const stalePath = path.join(targetDir, stale);
  if (fs.existsSync(stalePath)) {
    fs.unlinkSync(stalePath);
  }
}

let totalBytes = 0;
let fileCount = 0;

for (const file of HUMAN_PKG_MODEL_FILES) {
  const src = path.join(sourceDir, file);
  const dst = path.join(targetDir, file);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required Human face model file: ${src}`);
  }
  fs.copyFileSync(src, dst);
  totalBytes += fs.statSync(dst).size;
  fileCount++;
}

for (const file of CUSTOM_ASSET_MODEL_FILES) {
  const src = path.join(customAssetsDir, file);
  const dst = path.join(targetDir, file);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required biometric model asset: ${src}`);
  }
  fs.copyFileSync(src, dst);
  totalBytes += fs.statSync(dst).size;
  fileCount++;
}

console.log(
  `[sync-face-models] Synced ${fileCount} face model files (${(
    totalBytes /
    (1024 * 1024)
  ).toFixed(2)} MB) to public/models`
);
