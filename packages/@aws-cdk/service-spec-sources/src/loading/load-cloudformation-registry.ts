// A build tool to validate that our type definitions cover all resources
//
// Not a lot of thought given to where this needs to live yet.
import { promises as fs } from 'fs';
import * as path from 'path';
import * as util from 'util';
import { Failure, failure, isFailure, isSuccess, Result } from '@cdklabs/tskb';
import Ajv from 'ajv';
import * as _glob from 'glob';
import { CloudFormationRegistryResource } from '../types';

const glob = util.promisify(_glob.glob);

export enum SchemaValidation {
  NONE,
  WARN,
  FAIL,
}

export async function loadCloudFormationRegistryDirectory(
  directory: string,
  validate=SchemaValidation.FAIL,
): Promise<Array<Result<CloudFormationRegistryResource>>> {
  const ajv = new Ajv();
  const cfnSchemaJson = JSON.parse(await fs.readFile(path.join(__dirname, '../../schemas/CloudFormationRegistryResource.schema.json'), { encoding: 'utf-8' }));
  const validateCfnResource = ajv.compile(cfnSchemaJson);

  const ret = [];
  for (const fileName of await glob(path.join(directory, '*.json'))) {
    const file = JSON.parse(await fs.readFile(fileName, { encoding: 'utf-8' }));
    const valid = await validateCfnResource(file);

    if (validate !== SchemaValidation.NONE && !valid) {
      ret.push(failure(formatErrors(fileName, validateCfnResource.errors)));
    }

    if (validate !== SchemaValidation.FAIL || valid) {
      ret.push(file);
    }
  }
  return ret;

  function formatErrors(fileName: string, errors: Ajv.ErrorObject[] | null | undefined) {
    return [
      fileName,
      '='.repeat(60),
      util.inspect(errors),
    ].join('\n');
  }
}

export interface CloudFormationRegistryResources {
  readonly regionName: string;
  readonly resources: Array<CloudFormationRegistryResource>;
  readonly failures: Failure[];
}

export async function loadDefaultCloudFormationRegistryResources(validate=SchemaValidation.FAIL): Promise<CloudFormationRegistryResources[]> {
  return Promise.all((await glob(path.join(__dirname, '../../../../../sources/CloudFormationSchema/*'))).map(async (directoryName) => {
    const regionName = path.basename(directoryName);
    const resources = await loadCloudFormationRegistryDirectory(directoryName, validate);

    const ret: CloudFormationRegistryResources = {
      regionName,
      resources: resources.filter(isSuccess),
      failures: resources.filter(isFailure),
    };
    return ret;
  }));
}