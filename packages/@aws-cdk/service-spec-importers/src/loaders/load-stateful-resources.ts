import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { StatefulResources } from '../types';

export async function loadDefaultStatefulResources(
  filePath: string,
  options: LoadSourceOptions = {},
): Promise<LoadResult<StatefulResources>> {
  const loader = await Loader.fromSchemaFile<StatefulResources>('StatefulResources.schema.json', {
    mustValidate: options.validate,
  });

  const result = await loader.loadFile(filePath);
  assertSuccess(result);
  return result;
}
