import * as path from 'path';
import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult } from './loader';
import { StatefulResources } from '../types';

export async function loadDefaultStatefulResources(mustValidate = true): Promise<LoadResult<StatefulResources>> {
  const loader = await Loader.fromSchemaFile<StatefulResources>('StatefulResources.schema.json', { mustValidate });

  const result = await loader.loadFile(
    path.join(__dirname, '../../../../../sources/StatefulResources/StatefulResources.json'),
  );
  assertSuccess(result);
  return result;
}
