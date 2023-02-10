// A build tool to validate that our type definitions cover all resources
//
// Not a lot of thought given to where this needs to live yet.
import { promises as fs } from 'fs';
import Ajv from 'ajv';
import * as _glob from 'glob';
import * as path from 'path';
import * as util from 'util';
import { CloudFormationRegistryResource } from '../types';
import { Result } from '@cdklabs/tskb';

const glob = util.promisify(_glob.glob);

export async function loadCloudFormationRegistryDirectory(directory: string): Promise<Array<Result<CloudFormationRegistryResource>>> {
  const ajv = new Ajv();
  const cfnSchemaJson = JSON.parse(await fs.readFile(path.join(__dirname, '../../schemas/CloudFormationRegistryResource.schema.json'), { encoding: 'utf-8' }));
  const validateCfnResource = ajv.compile(cfnSchemaJson);

  for (const fileName of await glob(path.join(directory, '*.json'))) {
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
}

async function main() {

  console.log(process.cwd());

  let errors = 0;
  for (const fileName of glob.sync(path.join(__dirname, '../../../sources/CloudFormationSchema/*/*.json'))) {
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
