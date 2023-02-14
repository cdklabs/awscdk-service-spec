import { promises as fs } from 'fs';
import { SchemaValidation } from '@aws-cdk/service-spec-sources';
import { errorMessage } from '@cdklabs/tskb';
import { buildDatabase } from '../index';

async function main() {
  // FIXME: Switch this to 'FAIL' at some point
  const validateJsonSchema = SchemaValidation.WARN;

  console.log('Building...');
  const { db, fails } = await buildDatabase({
    validateJsonSchema,
  });

  console.log('Saving db.json');
  await fs.writeFile('db.json', JSON.stringify(db.save(), undefined, 1), { encoding: 'utf-8' });

  for (const fail of fails) {
    console.error(errorMessage(fail));

    if ((validateJsonSchema as SchemaValidation) === SchemaValidation.FAIL) {
      process.exitCode = 1;
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});