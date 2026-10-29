import * as path from 'node:path';
import { findMissingInputFields, formatMissingInputFields } from '@aws-cdk/service-spec-importers';
import { loadDatabase } from '@aws-cdk/service-spec-types';
import { patchCloudFormationRegistry } from './patches/registry-patches';

const SOURCES = path.join(__dirname, '../../../../sources');

/**
 * Fail if the L1 that CDK renders from a database misses a field that the current CloudFormation schemas accept
 * as input
 *
 * Usage: check-input-fields [DATABASE], where DATABASE defaults to the db.json.gz of this package.
 */
async function main() {
  const db = await loadDatabase(process.argv[2] ?? path.join(__dirname, '../db.json.gz'));
  const missing = await findMissingInputFields(
    db,
    path.join(SOURCES, 'CloudFormationSchema'),
    patchCloudFormationRegistry,
  );
  console.log(formatMissingInputFields(missing));
  process.exitCode = missing.length > 0 ? 1 : 0;
}

main().catch((error) => {
  process.exitCode = 1;
  console.error(error);
});
