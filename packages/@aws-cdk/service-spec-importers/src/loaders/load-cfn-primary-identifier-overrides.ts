import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { CfnPrimaryIdentifierOverrides } from '../types';

export async function loadCfnPrimaryIdentifierOverrides(
  filePath: string,
  options: LoadSourceOptions = {},
): Promise<LoadResult<CfnPrimaryIdentifierOverrides>> {
  const loader = await Loader.fromSchemaFile<CfnPrimaryIdentifierOverrides>(
    'CfnPrimaryIdentifierOverrides.schema.json',
    {
      mustValidate: options.validate,
    },
  );

  const result = await loader.loadFile(filePath);
  assertSuccess(result);
  return result;
}
