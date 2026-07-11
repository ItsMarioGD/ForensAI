const { spawn } = require('child_process');
const path = require('path');

const frontend = spawn('npx', ['vite', '--port', '5173'], {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'inherit',
  shell: true
});

const backend = spawn('uvicorn', ['main:app', '--reload', '--port', '8001'], {
  cwd: path.join(__dirname, 'api'),
  stdio: 'inherit',
  shell: true
});

const electron = spawn('npx', ['electron', '.'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

process.on('SIGINT', () => {
  frontend.kill();
  backend.kill();
  electron.kill();
  process.exit(0);
});