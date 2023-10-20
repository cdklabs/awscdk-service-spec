import { promises as fs } from 'fs';
import { DatabaseBuilder } from '../build-database';

async function main() {
  console.log('Building...');
  const { db, report } = await DatabaseBuilder.buildDatabase({
    // FIXME: Switch this to 'true' at some point
    mustValidate: false,
  });

  console.log('Saving db.json');
  await fs.writeFile('db.json', JSON.stringify(db.save()), { encoding: 'utf-8' });

  await report.write('build-report');
  console.log('Problems encountered (see build-report/ directory)');
  console.log(report.counts);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
