import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { GetAttAllowList } from '../types';

export async function loadGetAttAllowList(
  filePath: string,
  options: LoadSourceOptions = {},
): Promise<LoadResult<GetAttAllowList>> {
  const loader = await Loader.fromSchemaFile<GetAttAllowList>('GetAttAllowList.schema.json', {
    mustValidate: options.validate,
  });

  const result = await loader.loadFile(filePath);
  assertSuccess(result);
  return result;
}
