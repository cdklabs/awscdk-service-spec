import { emptyDatabase, loadDatabase } from '@aws-cdk/service-spec-types';
import { Command } from 'commander';
import { handleFailure } from './util';
import { DbDiff } from '../db-diff';
import { DiffFormatter } from '../diff-fmt';

async function main() {
  const program = new Command();

  program
    .name('diff-db')
    .description('Calculate differences between two databases')
    .argument('<db1>', 'First database file')
    .argument('[db2]', 'Second database file')
    .option('-j, --json', 'Output json', false)
    .parse();
  const options = program.opts();
  const args = program.args;

  let db1;
  let db2;
  let realDiff;
  if (args[1]) {
    // Compare 2 actual database
    db1 = await loadDatabase(args[0]);
    db2 = await loadDatabase(args[1]);
    realDiff = true;
  } else {
    // Compare 1 database to an empty one (count everything as added)
    db1 = emptyDatabase();
    db2 = await loadDatabase(args[0]);
    realDiff = false;
  }

  const result = new DbDiff(db1, db2).diff();

  const hasChanges =
    Object.keys(result.services.added ?? {}).length +
      Object.keys(result.services.removed ?? {}).length +
      Object.keys(result.services.updated ?? {}).length >
    0;

  if (options.json) {
    console.log(JSON.stringify(result, undefined, 2));
  } else {
    console.log(new DiffFormatter(db1, db2).format(result));
  }

  process.exitCode = hasChanges && realDiff ? 1 : 0;
}

main().catch(handleFailure);
