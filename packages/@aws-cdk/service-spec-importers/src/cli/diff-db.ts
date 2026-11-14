import { emptyDatabase, loadDatabase } from '@aws-cdk/service-spec-types';
import { Command } from 'commander';
import { CliError, handleFailure } from './util';
import { DbDiff } from '../db-diff';
import { DiffFormatter } from '../diff-fmt';
import { compareL1, formatL1Changes, hasL1Loss } from '../l1-compat';

async function main() {
  const program = new Command();

  program
    .name('diff-db')
    .description('Calculate differences between two databases')
    .argument('<db1>', 'First database file')
    .argument('[db2]', 'Second database file')
    .option('-j, --json', 'Output json', false)
    .option(
      '--l1-compat',
      'Compare the L1 code CDK renders from <db1> (a released database) and <db2>, instead of the databases. Exits with 1 if <db2> lost released type history',
      false,
    )
    .parse();
  const options = program.opts();
  const args = program.args;

  if (options.l1Compat) {
    if (!args[1]) {
      throw new CliError('--l1-compat needs two databases: the released database and the new database');
    }
    const changes = compareL1(await loadDatabase(args[0]), await loadDatabase(args[1]));
    console.log(options.json ? JSON.stringify(changes, undefined, 2) : formatL1Changes(changes));
    process.exitCode = hasL1Loss(changes) ? 1 : 0;
    return;
  }

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
