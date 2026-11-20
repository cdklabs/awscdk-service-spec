import { emptyDatabase, loadDatabase } from '@aws-cdk/service-spec-types';
import { Command } from 'commander';
import { CliError, handleFailure } from './util';
import { findBreakingChanges, formatBreakingChanges } from '../breaking-changes';
import { DbDiff } from '../db-diff';
import { DiffFormatter } from '../diff-fmt';
import { compareL1, formatL1Changes } from '../l1-changes';

async function main() {
  const program = new Command();

  program
    .name('diff-db')
    .description('Calculate differences between two databases')
    .argument('<db1>', 'First database file')
    .argument('[db2]', 'Second database file')
    .option('-j, --json', 'Output json', false)
    .option(
      '--l1-changes',
      'Report the struct renames and merges, removals, requiredness changes, other changes and added fields in the L1 code CDK renders from <db1> and from <db2>, instead of the database differences',
      false,
    )
    .option(
      '--breaking-changes',
      'Print the changelog text for the L1 pull request: the "CHANGES TO L1 RESOURCES" paragraph and one line for each change from <db1> to <db2> that can break existing CloudFormation templates or CDK code; with --l1-changes, after the L1 change report; with --json, the list of those changes',
      false,
    )
    .parse();
  const options = program.opts();
  const args = program.args;

  if (options.l1Changes || options.breakingChanges) {
    if (!args[1]) {
      const option = options.l1Changes ? '--l1-changes' : '--breaking-changes';
      throw new CliError(`${option} needs two databases: the base database and the new database`);
    }
    const [base, head] = [await loadDatabase(args[0]), await loadDatabase(args[1])];
    const changes = compareL1(base, head);
    if (!options.breakingChanges) {
      console.log(options.json ? JSON.stringify(changes, undefined, 2) : formatL1Changes(changes));
      return;
    }
    const breaking = findBreakingChanges(base, head, changes);
    if (options.json) {
      const output = options.l1Changes ? { ...changes, breakingChanges: breaking } : breaking;
      console.log(JSON.stringify(output, undefined, 2));
    } else {
      const changelog = formatBreakingChanges(breaking);
      console.log(options.l1Changes ? `${formatL1Changes(changes)}\n\n${changelog}` : changelog);
    }
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
