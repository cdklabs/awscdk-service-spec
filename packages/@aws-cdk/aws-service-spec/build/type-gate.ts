import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { compareL1, formatL1Changes, typeGate } from '@aws-cdk/service-spec-importers';
import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { FullDatabase, RELEASED_DATABASE, TYPE_MAPPINGS } from './full-database';

const ROOT = path.join(__dirname, '../../../..');

/**
 * The type history gate, see "Type history gate" in README.md
 *
 * --snapshot and --pins build against another released database, such as the base branch's.
 */
async function main() {
  const { values } = parseArgs({
    options: {
      'snapshot': { type: 'string' },
      'pins': { type: 'string' },
      'entries-file': { type: 'string' },
    },
  });
  if (!!values.snapshot !== !!values.pins) {
    throw new Error('--snapshot and --pins go together');
  }
  const releasedDatabase =
    values.snapshot && values.pins
      ? { snapshot: path.resolve(values.snapshot), pins: path.resolve(values.pins) }
      : RELEASED_DATABASE;

  const { db, typeHistory } = await new FullDatabase(emptyDatabase(), {
    validate: false,
    releasedDatabase,
  }).buildWithTypeHistory();
  const gate = typeGate(typeHistory.result, {
    mappingFile: path.relative(ROOT, TYPE_MAPPINGS),
    baselineVersion: typeHistory.released.pins.version,
  });

  console.log(gate.report);
  console.log('');
  console.log(formatL1Changes(compareL1(typeHistory.released.db, db)));
  if (gate.failed && values['entries-file']) {
    await writeFile(values['entries-file'], `${gate.entries}\n`);
  }
  process.exitCode = gate.failed ? 1 : 0;
}

main().catch((error) => {
  process.exitCode = 1;
  console.error(error);
});
