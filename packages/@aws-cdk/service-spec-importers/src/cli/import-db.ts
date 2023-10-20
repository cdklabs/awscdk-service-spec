import { SpecDatabase, emptyDatabase, loadDatabase } from '@aws-cdk/service-spec-types';
import { writeFile } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import * as zlib from 'node:zlib';
import { Command } from 'commander';
import { DatabaseBuilder } from '../build-database';
import { CliError, handleFailure } from './util';
import { ProblemReport } from '../report';

async function main() {
  const program = new Command();

  program
    .name('import-db')
    .description('Import service specification sources into a service model database')
    .argument('[db]', 'The database file', 'db.json')
    .option('-i, --input <db-file>', 'Load an existing database as base, imported sources are additive.')
    .option('-c, --gzip', 'Compress the database file using gzip')
    .option('-f, --force', 'Force overwriting an existing file', false)
    .option('-d, --debug', 'Print additional debug output during import', false)
    .option('-r, --report <report-dir>', 'Create a detailed build report in the specified directory')
    .parse();

  const outputFile = program.args[0] ?? 'db.json';
  const options = program.opts();
  options.gzip = options.gzip ?? outputFile.endsWith('.gz');

  if (existsSync(outputFile) && !options.force) {
    throw new CliError(
      `Database file ${outputFile} already exists. Please use '--force' to overwrite the existing file.`,
    );
  }

  const baseDb = await database(options.input);

  process.stdout.write('Importing sources... ');
  const { db, report } = await DatabaseBuilder.buildDatabase(baseDb, {
    // FIXME: Switch this to 'true' at some point
    mustValidate: false,
    quiet: !options.debug,
  });

  const numProblems = countProblems(report);
  const problemHint = ` (${numProblems} problems encountered)`;
  process.stdout.write(`OK${numProblems ? problemHint : ''}\n`);
  if (numProblems && !options.report) {
    process.stdout.write('💡 Hint: Run with --report <report-directory> for further details.\n');
  }
  process.stdout.write(`\n`);

  process.stdout.write(`Writing database to file ${outputFile}... `);
  await writeDatabase(db, outputFile, options.gzip);
  process.stdout.write('OK\n\n');

  if (options.report) {
    process.stdout.write(`Creating build report in ${options.report}... `);
    await report.write(options.report);
    process.stdout.write('OK\n\n');
  }
}

async function writeDatabase(db: SpecDatabase, file: string, compress = false) {
  const data = JSON.stringify(db.save());

  if (compress) {
    const gzip = zlib.createGzip();
    gzip.pipe(createWriteStream(file));
    gzip.write(data);
    gzip.end();
    return;
  }

  await writeFile(file, data, { encoding: 'utf-8' });
}

function countProblems(report: ProblemReport): number {
  return Object.values(report.counts).reduce((total, current) => total + current, 0);
}

async function database(input?: string) {
  if (input) {
    process.stdout.write(`Loading existing database at ${input}... `);
    const db = loadDatabase(input);
    process.stdout.write('OK\n\n');
    return db;
  }

  process.stdout.write(`Using empty database.\n\n`);
  return emptyDatabase();
}

main().catch(handleFailure);
