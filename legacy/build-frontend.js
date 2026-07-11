const fs = require('fs');
const path = require('path');
const https = require('https');

const frontendDir = path.join(__dirname, 'frontend');
const distDir = path.join(__dirname, 'dist');
const vendorDir = path.join(distDir, 'vendor');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function buildFrontend() {
  console.log('Building frontend for Electron...');

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  if (!fs.existsSync(vendorDir)) {
    fs.mkdirSync(vendorDir, { recursive: true });
  }

  console.log('Downloading vendor libraries...');
  await Promise.all([
    downloadFile('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', path.join(vendorDir, 'three.min.js')),
    downloadFile('https://unpkg.com/react@18/umd/react.production.min.js', path.join(vendorDir, 'react.production.min.js')),
    downloadFile('https://unpkg.com/react-dom@18/umd/react-dom.production.min.js', path.join(vendorDir, 'react-dom.production.min.js')),
    downloadFile('https://unpkg.com/@babel/standalone@7/babel.min.js', path.join(vendorDir, 'babel.min.js'))
  ]);
  console.log('Vendor libraries downloaded.');

  let htmlContent = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf-8');

  htmlContent = htmlContent
    .replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js"><\/script>/, '<script src="vendor/three.min.js"></script>')
    .replace(/<script crossorigin src="https:\/\/unpkg\.com\/react@18\/umd\/react\.production\.min\.js"><\/script>/, '<script src="vendor/react.production.min.js"></script>')
    .replace(/<script crossorigin src="https:\/\/unpkg\.com\/react-dom@18\/umd\/react-dom\.production\.min\.js"><\/script>/, '<script src="vendor/react-dom.production.min.js"></script>')
    .replace(/<script src="https:\/\/unpkg\.com\/@babel\/standalone@7\/babel\.min\.js"><\/script>/, '<script src="vendor/babel.min.js"></script>')
    .replace(/<script type="text\/babel" src="app\.js"><\/script>/, '<script type="text/babel" src="app.js"></script>');

  fs.writeFileSync(path.join(distDir, 'index.html'), htmlContent);

  fs.copyFileSync(
    path.join(frontendDir, 'app.js'),
    path.join(distDir, 'app.js')
  );

  fs.copyFileSync(
    path.join(frontendDir, 'styles.css'),
    path.join(distDir, 'styles.css')
  );

  console.log('Frontend built successfully!');
}

buildFrontend().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});