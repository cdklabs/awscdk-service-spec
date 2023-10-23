import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { CloudWatchConsoleServiceDirectory } from '../types';

export async function loadDefaultCloudWatchConsoleServiceDirectory(
  filePath: string,
  options: LoadSourceOptions = {},
): Promise<LoadResult<CloudWatchConsoleServiceDirectory>> {
  const loader = await Loader.fromSchemaFile<CloudWatchConsoleServiceDirectory>(
    'CloudWatchConsoleServiceDirectory.schema.json',
    { mustValidate: options.validate },
  );

  const result = await loader.loadFile(filePath);
  assertSuccess(result);
  return result;
}
