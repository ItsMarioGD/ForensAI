const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== ForensIA Build Script ===\n');

try {
  console.log('1. Building frontend...');
  execSync('node build-frontend.js', { stdio: 'inherit', cwd: __dirname });

  console.log('\n2. Building Electron app...');
  execSync('npx electron-builder --win --x64', { stdio: 'inherit', cwd: __dirname });

  console.log('\n=== Build completed successfully! ===');
  console.log('Installer located in: dist-electron/');
} catch (err) {
  console.error('\n=== Build failed ===', err.message);
  process.exit(1);
}