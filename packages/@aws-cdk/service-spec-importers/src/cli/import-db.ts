import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import * as zlib from 'node:zlib';
import { SpecDatabase, emptyDatabase, loadDatabase } from '@aws-cdk/service-spec-types';
import { Command } from 'commander';
import { CliError, handleFailure } from './util';
import { DatabaseBuilder } from '../db-builder';

const AVAILABLE_SOURCES: Record<string, keyof DatabaseBuilder> = {
  cfnSchemaDir: 'importCloudFormationRegistryResources',
  samSchema: 'importSamJsonSchema',
  cfnSpecDir: 'importCloudFormationResourceSpec',
  samSpec: 'importSamResourceSpec',
  cfnDocs: 'importCloudFormationDocs',
  statefulResources: 'importStatefulResources',
  cannedMetrics: 'importCannedMetrics',
  arnTemplates: 'importArnTemplates',
  oobRelationships: 'importOobRelationships',
  eventbridgeschema: 'importEventBridgeSchema',
};

async function main() {
  const program = new Command();

  program
    .name('import-db')
    .description('Import service specification sources into a service model database')
    .argument('[database]', 'The database file', 'db.json')

    .option(
      '-s, --source <definition...>',
      `Import sources into the database. Use the format <source>:<path> to define sources. Imports are ordered. See documentation for details.\nAvailable sources: ${Object.keys(
        AVAILABLE_SOURCES,
      ).join(', ')}`,
    )

    .option('-l, --load <database>', 'Load an existing database as base, imported sources become additive')
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

  const baseDb = await database(options.load);

  process.stdout.write('Importing sources... ');
  const builder = new DatabaseBuilder(baseDb, {
    validate: options.validate ?? false,
    debug: options.debug ?? false,
  });

  try {
    for (const source of options.source) {
      const [method, args] = sourceInstructions(source);
      (builder[method] as CallableFunction)(...args);
    }
  } catch (error) {
    process.stdout.write('FAIL');
    throw error;
  }

  const { db, report } = await builder.build();

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

function sourceInstructions(source: string): [keyof DatabaseBuilder, any[]] {
  const [type, path] = source.split(':', 2);

  if (!type || !path) {
    throw new CliError(`Invalid source format. Expected <source>:<path>, got: ${source}`);
  }

  if (!AVAILABLE_SOURCES[type]) {
    throw new CliError(`Unknown source provided: ${source}`);
  }

  return [AVAILABLE_SOURCES[type], [path]];
}

async function writeDatabase(db: SpecDatabase, file: string, compress = false) {
  const data = JSON.stringify(db.save());

  if (compress) {
    return writeFile(file, zlib.gzipSync(data), { encoding: 'binary' });
  }

  return writeFile(file, data, { encoding: 'utf-8' });
}

async function database(baseDb?: string) {
  if (baseDb) {
    process.stdout.write(`Loading existing database at ${baseDb}... `);
    const db = loadDatabase(baseDb);
    process.stdout.write('OK\n\n');
    return db;
  }

  process.stdout.write(`Using empty database.\n\n`);
  return emptyDatabase();
}

main().catch(handleFailure);
