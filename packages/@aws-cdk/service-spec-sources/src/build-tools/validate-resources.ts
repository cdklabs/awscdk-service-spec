// A build tool to validate that our type definitions cover all resources
//
// Not a lot of thought given to where this needs to live yet.
import { promises as fs } from 'fs';
import Ajv from 'ajv';
import * as glob from 'glob';

async function main() {
  const ajv = new Ajv();

  const cfnSchemaJson = JSON.parse(await fs.readFile('schemas/CloudFormationRegistryResource.schema.json', { encoding: 'utf-8' }));
  const validateCfnResource = ajv.compile(cfnSchemaJson);

  console.log(process.cwd());

  let errors = 0;
  for (const fileName of glob.sync('./src/sources/CloudFormationSchema.jd/*/*.json')) {
    const file = JSON.parse(await fs.readFile(fileName, { encoding: 'utf-8' }));
    const valid = await validateCfnResource(file);
    if (!valid) {
      console.log(fileName);
      console.log('='.repeat(60));
      console.log(validateCfnResource.errors);
      console.log('');

      errors += validateCfnResource.errors?.length ?? 0;
      process.exitCode = 1;
    }
  }

  if (errors > 0) {
    console.log(`${errors} validation errors`);
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});