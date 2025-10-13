import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { OobRelationshipData } from '../types';

export async function loadOobRelationships(
  filePath: string,
  options: LoadSourceOptions = {},
): Promise<LoadResult<OobRelationshipData>> {
  const loader = await Loader.fromSchemaFile<OobRelationshipData>('OobRelationshipData.schema.json', {
    mustValidate: options.validate,
  });

  const result = await loader.loadFile(filePath);
  assertSuccess(result);
  return result;
}
