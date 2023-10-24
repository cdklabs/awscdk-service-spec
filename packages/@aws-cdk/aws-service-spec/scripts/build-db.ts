import * as zlib from 'node:zlib';
import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { FullDatabase } from './full-database';
import { writeFile } from 'node:fs/promises';

async function main() {
  const outputFile = 'db.json.gz';
  const buildReport = 'build-report';

  process.stdout.write('Importing default sources... ');
  const { db, report } = await new FullDatabase(emptyDatabase(), {
    // @TODO: Switch this to 'true' once validation passes (this will never happen)
    validate: false,
    debug: Boolean(process.env.DEBUG),
  }).build();
  const importResult = report.totalCount ? `WARN (${report.totalCount} problems encountered)` : 'OK';
  process.stdout.write(`${importResult}\n`);

  process.stdout.write(`Writing database to file ${outputFile}... `);
  const data = JSON.stringify(db.save());
  await writeFile(outputFile, zlib.gzipSync(data), { encoding: 'binary' });
  process.stdout.write('OK\n');

  process.stdout.write(`Creating build report in ${buildReport}... `);
  await report.write(buildReport);
  process.stdout.write('OK\n');
}

main().catch((error) => {
  process.exitCode = 1;
  console.error('FAIL\n\n');
  console.error(error);
});
