import * as path from 'path';
import * as util from 'util';
import * as _glob from 'glob';
import { combineLoadResults, Loader, LoadResult } from './loader';
import { patchCloudFormationRegistry } from './patches/registry-patches';
import { CloudFormationRegistryResource } from '../types';

const glob = util.promisify(_glob.glob);

export async function loadCloudFormationRegistryDirectory(
  directory: string,
  mustValidate = true,
  errorRootDirectory?: string,
): Promise<LoadResult<CloudFormationRegistryResource[]>> {
  const loader = await Loader.fromSchemaFile<CloudFormationRegistryResource>(
    'CloudFormationRegistryResource.schema.json',
    {
      mustValidate,
      patcher: patchCloudFormationRegistry,
      errorRootDirectory,
    },
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
  const errorRootDirectory = path.join(__dirname, '../../../../../sources/CloudFormationSchema');
  const files = await glob(`${errorRootDirectory}/*`);
  return combineLoadResults(
    await Promise.all(
      files.map(async (directoryName) => {
        const regionName = path.basename(directoryName);
        const resources = await loadCloudFormationRegistryDirectory(directoryName, mustValidate, errorRootDirectory);

        return {
          ...resources,
          value: {
            regionName,
            resources: resources.value,
          },
        };
      }),
    ),
  );
}
