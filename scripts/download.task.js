const child_process= require('child_process');
const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [url, destination, ...rest] = process.argv.slice(2);
const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const shouldExtract = rest.includes("--extract")
// Only keep this file of a gzipped tarball
const tarballEntry = option('--tarball-entry');
// The expected digest of the download, in the format of npm's dist.integrity (for example sha512-<base64>)
const integrity = option('--integrity');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sources-'));
const tmpDest = path.join(tmpDir, 'data');
const tmpExtract = path.join(tmpDir, 'extract');


const reqHeaders = new Headers();
reqHeaders.append('pragma', 'no-cache');
reqHeaders.append('cache-control', 'no-cache');

var reqOptions = {
  method: 'GET',
  headers: reqHeaders,
};

const file = fs.createWriteStream(tmpDest);
fetch(url, reqOptions).then((res) => {

  if (res.status !== 200) {
    throw new Error(`Http Status ${res.status}`);
  }

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

      // Verify before anything is extracted or written to the destination
      if (integrity) {
        const algorithm = /^(sha256|sha384|sha512)-/.exec(integrity)?.[1];
        if (!algorithm) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          console.error(`Unsupported integrity format: ${integrity}`);
          process.exit(1);
        }
        const actual = `${algorithm}-${crypto.createHash(algorithm).update(fs.readFileSync(tmpDest)).digest('base64')}`;
        if (actual !== integrity) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          console.error(`Integrity check failed: expected ${integrity}, got ${actual}`);
          process.exit(1);
        }
        console.log(`Integrity ${integrity} verified`);
      }

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
      } else if (tarballEntry) {
        fs.mkdirSync(tmpExtract, { recursive: true });
        const { status } = child_process.spawnSync('tar', ['-xzf', tmpDest, '-C', tmpExtract, tarballEntry], {
          cwd: process.cwd(),
          stdio: [null, null, process.stderr],
        });
        if (status !== 0) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          console.error(`Extracting ${tarballEntry} failed`);
          process.exit(1);
        }

        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.cpSync(path.join(tmpExtract, tarballEntry), destination);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        console.log(`Extracted ${tarballEntry}, SHA 256:`);
        child_process.spawnSync('shasum', ['-a', '256', destination], {
          cwd: process.cwd(),
          stdio: 'inherit',
        });
      } else {
        fs.cpSync(tmpDest, destination);
        fs.unlinkSync(tmpDest);
      }
    })
    .on('error', function (error) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      throw error;
    });  
}).catch(e => {
  console.error(`Download failed: ${e.message}`);
  process.exit(1);
});
