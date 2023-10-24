import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import * as zlib from 'node:zlib';
import { SpecDatabase, emptyDatabase, loadDatabase } from '@aws-cdk/service-spec-types';
import { Command } from 'commander';
import { CliError, handleFailure } from './util';
import { DatabaseBuilder } from '../db-builder';

async function main() {
  const program = new Command();

  program
    .name('import-db')
    .description('Import service specification sources into a service model database')
    .argument('[database]', 'The database file', 'db.json')
    .option('-i, --input <database>', 'Load an existing database as base, imported sources are additive.')
    .option('-c, --gzip', 'Compress the database file using gzip')
    .option('-f, --force', 'Force overwriting an existing file', false)
    .option('-d, --debug', 'Print additional debug output during import', false)
    .option('-r, --report <report-directory>', 'Create a detailed build report in the specified directory')
    .option('-v, --validate', 'Validate imported sources and fail if any data is invalid', false)
    .parse();

  const outputFile = program.args[0] ?? 'db.json';
  const options = program.opts();
  const compress = options.gzip ?? outputFile.endsWith('.gz');

  if (existsSync(outputFile) && !options.force) {
    throw new CliError(
      `Database file at ${outputFile} already exists. Please use '--force' to overwrite the existing file.`,
    );
  }

  const baseDb = await database(options.input);

  process.stdout.write('Importing sources... ');
  const { db, report } = await new DatabaseBuilder(baseDb, {
    validate: options.validate ?? false,
    debug: options.debug ?? false,
  }).build();

  const importResult = report.totalCount ? `WARN (${report.totalCount} problems encountered)` : 'OK';
  process.stdout.write(`${importResult}\n`);
  if (report.totalCount && !options.report) {
    process.stdout.write('💡 Hint: Run with --report <report-directory> for details.\n');
  }
  process.stdout.write(`\n`);

  process.stdout.write(`Writing database to file ${outputFile}... `);
  await writeDatabase(db, outputFile, compress);
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
    return writeFile(file, zlib.gzipSync(data), { encoding: 'binary' });
  }

  return writeFile(file, data, { encoding: 'utf-8' });
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
