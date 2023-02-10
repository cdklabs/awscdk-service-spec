import { promises as fs } from 'fs';
import { errorMessage } from '@cdklabs/tskb';
import { buildDatabase } from '../index';

async function main() {
  console.log('Building...');
  const { db, fails } = await buildDatabase();
  console.log('Saving db.json');
  await fs.writeFile('db.json', JSON.stringify(db.save(), undefined, 1), { encoding: 'utf-8' });

  for (const fail of fails) {
    console.log(errorMessage(fail));
    process.exitCode = 1;
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});