const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;

const filesToInclude = [
  'manifest.json',
  'background.js',
  'content.js',
  'inject.js',
  'popup.html',
  'popup.js',
  'styles.css',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
  '_locales/en/messages.json',
  '_locales/es/messages.json',
  '_locales/ja/messages.json',
  '_locales/ko/messages.json',
  '_locales/zh_CN/messages.json',
  '_locales/zh_TW/messages.json'
];

for (const f of filesToInclude) {
  const fullPath = path.join(rootDir, f);
  if (!fs.existsSync(fullPath)) {
    console.error('Missing required file:', f);
    process.exit(1);
  }
}

const stagingDir = path.join(rootDir, '.dist_staging');
if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir);

for (const f of filesToInclude) {
  const src = path.join(rootDir, f);
  const dest = path.join(stagingDir, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

const zipOut = path.join(rootDir, 'youtube-dual-subtitles-v1.2.0.zip');
if (fs.existsSync(zipOut)) fs.unlinkSync(zipOut);

execSync(`powershell -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipOut}' -Force"`);

fs.rmSync(stagingDir, { recursive: true, force: true });

console.log('Successfully created:', zipOut);
