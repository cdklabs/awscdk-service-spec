// Check a change of the released database against npm and the base branch.
//
// Usage: node scripts/check-released-database-bump.js <base-branch-checkout>
//
// Run from the root of the change's checkout. For a pull request, set PULL_REQUEST to its number: the change is then
// what the pull request's merge commit (refs/pull/<number>/merge, fetched into the base checkout) changes, so a pull
// request that is behind the base branch but leaves the released database alone has nothing to check. Without it,
// or when that ref is missing, the change is the difference from the base branch.
//
// If the change keeps the pins, VERSION and db.json.gz, there is nothing to check. Otherwise it fails unless the npm
// tarball of the pinned version has the pinned integrity, its package/db.json.gz equals the snapshot, its
// package/package.json version equals VERSION, and the version is not lower than the base branch's. It writes
// `changed=true|false` and, when the base branch has a released database to run the type history gate against,
// `base-baseline=true` to $GITHUB_OUTPUT.
const child_process = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PINS = 'packages/@aws-cdk/aws-service-spec/build/released-database.json';
const SNAPSHOT = 'sources/ReleasedDatabase/db.json.gz';
const VERSION = 'sources/ReleasedDatabase/VERSION';
const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1';

async function main() {
  const [baseDir] = process.argv.slice(2);
  if (!baseDir) {
    throw new Error('Usage: check-released-database-bump.js <base-branch-checkout>');
  }

  const head = readBaseline('.');
  const base = readBaseline(baseDir);
  const pullRequestChanges = pullRequestChangesBaseline(baseDir);
  if (pullRequestChanges === false) {
    console.log(
      `The pull request does not change the released database (${head.pins.version} on its branch, ${
        base.pins ? base.pins.version : 'none'
      } on the base branch).`,
    );
    setOutput('changed', 'false');
    return;
  }
  if (pullRequestChanges === undefined && base.pins && sameBaseline(head, base)) {
    console.log(`The released database is unchanged: ${head.pins.version}.`);
    setOutput('changed', 'false');
    return;
  }
  console.log(
    `The released database changes from ${base.pins ? base.pins.version : 'none'} on the base branch to ${
      head.pins.version
    }.`,
  );

  const tarball = `https://registry.npmjs.org/@aws-cdk/aws-service-spec/-/aws-service-spec-${head.pins.version}.tgz`;
  const response = await fetch(tarball);
  if (!response.ok) {
    fail(`Downloading ${tarball} failed: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const integrity = `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`;
  if (integrity !== head.pins.integrity) {
    fail(`${tarball} has integrity ${integrity}, but ${PINS} pins ${head.pins.integrity}.`);
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'released-database-'));
  try {
    fs.writeFileSync(path.join(dir, 'package.tgz'), bytes);
    const tar = child_process.spawnSync('tar', ['-xzf', 'package.tgz', 'package/db.json.gz', 'package/package.json'], {
      cwd: dir,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    if (tar.status !== 0) {
      fail(`Extracting ${tarball} failed.`);
    }
    if (!fs.readFileSync(path.join(dir, 'package/db.json.gz')).equals(fs.readFileSync(SNAPSHOT))) {
      fail(
        `${SNAPSHOT} is not the db.json.gz of ${head.pins.version}: run 'npx projen update-source:released-database'.`,
      );
    }
    const npmVersion = JSON.parse(fs.readFileSync(path.join(dir, 'package/package.json'), 'utf-8')).version;
    if (npmVersion !== head.version || npmVersion !== head.pins.version) {
      fail(
        `The npm package has version ${npmVersion}, ${VERSION} has ${head.version} and ${PINS} pins ${head.pins.version}.`,
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  if (base.pins && compareVersions(head.pins.version, base.pins.version) < 0) {
    fail(`The released database moves back from ${base.pins.version} to ${head.pins.version}.`);
  }
  console.log(`${SNAPSHOT} and ${VERSION} are those of ${head.pins.version} on npm.`);
  setOutput('changed', 'true');
  if (base.pins && base.snapshotSha256) {
    setOutput('base-baseline', 'true');
  }
}

/**
 * Whether the merge commit of the pull request in PULL_REQUEST changes the released database files, or undefined if
 * there is no pull request or no merge commit to read
 */
function pullRequestChangesBaseline(baseDir) {
  const number = process.env.PULL_REQUEST;
  if (!number) {
    return undefined;
  }
  if (!/^\d+$/.test(number)) {
    fail(`PULL_REQUEST must be a pull request number, got ${JSON.stringify(number)}.`);
  }
  const ref = `refs/pull/${number}/merge`;
  const fetched = child_process.spawnSync(
    'git',
    ['-C', baseDir, 'fetch', '--quiet', '--no-tags', '--depth=2', 'origin', ref],
    {
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  );
  if (fetched.status !== 0) {
    console.log(`${ref} is not available, for example because of merge conflicts: comparing with the base branch.`);
    return undefined;
  }
  const files = (revision) => {
    const listed = child_process.spawnSync(
      'git',
      ['-C', baseDir, 'ls-tree', '-r', revision, '--', PINS, VERSION, SNAPSHOT],
      {
        encoding: 'utf-8',
      },
    );
    if (listed.status !== 0) {
      fail(`Listing the released database files of ${ref} failed: ${listed.stderr}`);
    }
    return listed.stdout;
  };
  return files('FETCH_HEAD^1') !== files('FETCH_HEAD');
}

/**
 * The pins, VERSION and snapshot sha256 of a checkout, which may have the snapshot as a Git LFS pointer
 */
function readBaseline(dir) {
  const pinsFile = path.join(dir, PINS);
  if (!fs.existsSync(pinsFile)) {
    return {};
  }
  const pins = JSON.parse(fs.readFileSync(pinsFile, 'utf-8'));
  const valid =
    typeof pins.version === 'string' &&
    /^\d+\.\d+\.\d+$/.test(pins.version) &&
    typeof pins.integrity === 'string' &&
    /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(pins.integrity) &&
    typeof pins.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(pins.sha256);
  if (!valid) {
    fail(`${pinsFile} does not hold a version, an npm sha512 integrity and a sha256.`);
  }
  const versionFile = path.join(dir, VERSION);
  const snapshotFile = path.join(dir, SNAPSHOT);
  return {
    pins,
    version: fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf-8').trim() : undefined,
    snapshotSha256: fs.existsSync(snapshotFile) ? snapshotSha256(snapshotFile) : undefined,
  };
}

function snapshotSha256(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, LFS_POINTER.length).toString('utf-8') === LFS_POINTER) {
    const oid = /^oid sha256:([0-9a-f]{64})$/m.exec(bytes.toString('utf-8'));
    return oid ? oid[1] : undefined;
  }
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sameBaseline(a, b) {
  return (
    a.pins.version === b.pins.version &&
    a.pins.integrity === b.pins.integrity &&
    a.pins.sha256 === b.pins.sha256 &&
    a.version === b.version &&
    a.snapshotSha256 === b.snapshotSha256
  );
}

function compareVersions(a, b) {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
