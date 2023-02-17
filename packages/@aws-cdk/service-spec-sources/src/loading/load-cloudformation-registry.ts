import * as path from 'path';
import { Failure, isFailure, isSuccess, Result } from "@cdklabs/tskb";
import { CloudFormationRegistryResource } from '../types';
import { Loader, SchemaValidation } from "./loader";

import * as util from 'util';
import * as _glob from 'glob';

const glob = util.promisify(_glob.glob);

export async function loadCloudFormationRegistryDirectory(
  directory: string,
  validate=SchemaValidation.FAIL,
): Promise<Array<Result<CloudFormationRegistryResource>>> {
  const loader = await Loader.fromSchemaFile<CloudFormationRegistryResource>('CloudFormationRegistryResource.schema.json', validate);

  const files = await glob(path.join(directory, '*.json'));
  const results = await loader.loadFiles(files);

  return [
    ...results.filter(isSuccess),
    ...loader.failures,
  ];
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