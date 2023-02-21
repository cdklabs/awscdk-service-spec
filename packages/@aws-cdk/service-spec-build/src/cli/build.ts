import { promises as fs } from 'fs';
import { errorMessage } from '@cdklabs/tskb';
import { buildDatabase } from '../index';

async function main() {
  console.log('Building...');
  const { db, warnings } = await buildDatabase({
    // FIXME: Switch this to 'true' at some point
    mustValidate: false,
  });

  console.log('Saving db.json');
  await fs.writeFile('db.json', JSON.stringify(db.save(), undefined, 1), { encoding: 'utf-8' });

  for (const fail of warnings) {
    console.error(errorMessage(fail));
  }

  if (warnings.length > 0) {
    console.error(`${warnings.length} errors`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
