import * as path from 'path';
import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult } from './loader';
import { CloudWatchConsoleServiceDirectory } from '../types';

export async function loadDefaultCloudWatchConsoleServiceDirectory(
  mustValidate = true,
): Promise<LoadResult<CloudWatchConsoleServiceDirectory>> {
  const loader = await Loader.fromSchemaFile<CloudWatchConsoleServiceDirectory>(
    'CloudWatchConsoleServiceDirectory.schema.json',
    { mustValidate },
  );

  const result = await loader.loadFile(
    path.join(
      __dirname,
      '../../../../../sources/CloudWatchConsoleServiceDirectory/CloudWatchConsoleServiceDirectory.json',
    ),
  );
  assertSuccess(result);
  return result;
}
