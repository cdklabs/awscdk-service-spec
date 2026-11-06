import * as fs from 'node:fs';
import * as path from 'node:path';
import * as pj from 'projen';
import { DownloadScript } from './download-script';

/**
 * The pin file of the released database that every build uses as its baseline
 *
 * It holds the @aws-cdk/aws-service-spec version, the npm `dist.integrity` of its tarball and the sha256 of its
 * `db.json.gz`. The build refuses a snapshot without that sha256.
 */
export const RELEASED_DATABASE_PINS = 'packages/@aws-cdk/aws-service-spec/build/released-database.json';
export const RELEASED_DATABASE_DIR = 'sources/ReleasedDatabase';

export interface ReleasedDatabasePins {
  readonly version: string;
  readonly integrity: string;
  readonly sha256: string;
}

/**
 * Read the pin file, refusing values that are not a version, an npm sha512 integrity and a sha256
 *
 * The values end up in a task's command line, so anything else is rejected.
 */
export function readReleasedDatabasePins(root: string): ReleasedDatabasePins {
  const file = path.join(root, RELEASED_DATABASE_PINS);
  const pins = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const check = (name: keyof ReleasedDatabasePins, pattern: RegExp) => {
    if (typeof pins[name] !== 'string' || !pattern.test(pins[name])) {
      throw new Error(`Invalid ${name} in ${file}: ${JSON.stringify(pins[name])}`);
    }
    return pins[name] as string;
  };
  return {
    version: check('version', /^\d+\.\d+\.\d+$/),
    integrity: check('integrity', /^sha512-[A-Za-z0-9+/]+={0,2}$/),
    sha256: check('sha256', /^[0-9a-f]{64}$/),
  };
}

/**
 * Add the task that downloads the pinned released database and writes its version
 */
export function addReleasedDatabaseTask(project: pj.Project, pins: ReleasedDatabasePins) {
  const tarball = `https://registry.npmjs.org/@aws-cdk/aws-service-spec/-/aws-service-spec-${pins.version}.tgz`;
  project.addTask('update-source:released-database', {
    description: `Download the database of @aws-cdk/aws-service-spec ${pins.version} (the version in ${RELEASED_DATABASE_PINS}) into ${RELEASED_DATABASE_DIR}`,
    steps: [
      new DownloadScript(tarball, `${RELEASED_DATABASE_DIR}/db.json.gz`, {
        tarballEntry: 'package/db.json.gz',
        integrity: pins.integrity,
      }),
      { exec: `echo ${pins.version} > ${RELEASED_DATABASE_DIR}/VERSION` },
    ],
  });
}
