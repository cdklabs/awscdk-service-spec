import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { compareL1, formatL1Changes, typeGate } from '@aws-cdk/service-spec-importers';
import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { FullDatabase, RELEASED_DATABASE, TYPE_MAPPINGS } from './full-database';

const ROOT = path.join(__dirname, '../../../..');

/**
 * The type history gate: build the database and fail if the matcher left a released type undecided
 *
 * Usage: type-gate [--snapshot DB --pins PIN_FILE] [--entries-file FILE]
 *
 * --snapshot and --pins build against another released database, for example the base branch's. --entries-file
 * receives the undecided cases with their mapping entries when the gate fails.
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

  const { db, typeHistory } = await new FullDatabase(emptyDatabase(), { validate: false, releasedDatabase }).build();
  const gate = typeGate(typeHistory!.result, {
    mappingFile: path.relative(ROOT, TYPE_MAPPINGS),
    baselineVersion: typeHistory!.released.pins.version,
  });

  console.log(gate.report);
  console.log('');
  console.log(formatL1Changes(compareL1(typeHistory!.released.db, db)));
  if (gate.failed && values['entries-file']) {
    await writeFile(values['entries-file'], `${gate.entries}\n`);
  }
  process.exitCode = gate.failed ? 1 : 0;
}

main().catch((error) => {
  process.exitCode = 1;
  console.error(error);
});
