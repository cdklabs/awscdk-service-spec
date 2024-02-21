const child_process= require('child_process');
const fetch = require('node-fetch');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [url, destination, ...rest] = process.argv.slice(2);
const shouldExtract = rest.includes("--extract")

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sources-'));
const tmpDest = path.join(tmpDir, 'data');
const tmpExtract = path.join(tmpDir, 'extract');

const file = fs.createWriteStream(tmpDest);
fetch(url).then((res) => {
  res.body.pipe(file);
  file
    .on('finish', () => {
      file.close();
      console.log('Download completed');
      
      // Print a hash of the downloaded file that can be used for inspection
      console.log('SHA 256:');
      child_process.spawnSync('shasum', ['-a', '256', tmpDest], {
        cwd: process.cwd(),
        stdio: 'inherit',
      });

      if (shouldExtract) {
        fs.mkdirSync(tmpExtract, { recursive: true });
        const { status } = child_process.spawnSync('unzip', [tmpDest, '-d', tmpExtract], {
          cwd: process.cwd(),
          stdio: [null, null, process.stderr],
        });
        if (status !== 0) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          console.error('Extraction failed');
          return;
        }
  
        fs.rmSync(destination, { recursive: true, force: true });
        fs.mkdirSync(destination, { recursive: true });
        fs.cpSync(tmpExtract, destination, { recursive: true });
        fs.rmSync(tmpDir, { recursive: true, force: true });
        console.log('Extraction completed');
      } else {
        fs.cpSync(tmpDest, destination);
        fs.unlinkSync(tmpDest);
      }
    })
    .on('error', function (error) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      console.error(`Download failed: ${error.message}`);
    });
});
