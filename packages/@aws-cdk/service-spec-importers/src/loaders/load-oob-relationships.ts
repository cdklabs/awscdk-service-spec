import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { JsonLensPatcher } from '../patching';
import { OobRelationshipData } from '../types';

interface LoadOobOptions extends LoadSourceOptions {
  readonly patcher?: JsonLensPatcher;
}

export async function loadOobRelationships(
  filePath: string,
  options: LoadOobOptions = {},
): Promise<LoadResult<OobRelationshipData>> {
  const loader = await Loader.fromSchemaFile<OobRelationshipData>('OobRelationshipData.schema.json', {
    mustValidate: options.validate,
    patcher: options.patcher,
  });

  const result = await loader.loadFile(filePath);
  assertSuccess(result);
  return result;
}
