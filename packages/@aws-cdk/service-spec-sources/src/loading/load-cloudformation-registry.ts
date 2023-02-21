import * as path from 'path';
import * as util from 'util';
import * as _glob from 'glob';
import { combineLoadResults, Loader, LoadResult } from './loader';
import { CloudFormationRegistryResource } from '../types';

const glob = util.promisify(_glob.glob);

export async function loadCloudFormationRegistryDirectory(
  directory: string,
  mustValidate = true,
): Promise<LoadResult<CloudFormationRegistryResource[]>> {
  const loader = await Loader.fromSchemaFile<CloudFormationRegistryResource>(
    'CloudFormationRegistryResource.schema.json',
    mustValidate,
  );

  const files = await glob(path.join(directory, '*.json'));
  return loader.loadFiles(files);
}

export interface CloudFormationRegistryResources {
  readonly regionName: string;
  readonly resources: Array<CloudFormationRegistryResource>;
}

export async function loadDefaultCloudFormationRegistryResources(
  mustValidate = true,
): Promise<LoadResult<CloudFormationRegistryResources[]>> {
  const files = await glob(path.join(__dirname, '../../../../../sources/CloudFormationSchema/*'));
  return combineLoadResults(
    await Promise.all(
      files.map(async (directoryName) => {
        const regionName = path.basename(directoryName);
        const resources = await loadCloudFormationRegistryDirectory(directoryName, mustValidate);

        return {
          value: {
            regionName,
            resources: resources.value,
          },
          warnings: resources.warnings,
        };
      }),
    ),
  );
}
