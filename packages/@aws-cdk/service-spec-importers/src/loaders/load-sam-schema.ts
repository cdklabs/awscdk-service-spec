import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
// import { patchSamTemplateSpec } from '../../../aws-service-spec/build/patches/sam-patches';
import { SamTemplateSchema } from '../types';
import { JsonLensPatcher } from '../patching';

interface LoadSamSchemaSourceOptions extends LoadSourceOptions {
  readonly patcher?: JsonLensPatcher;
}

/**
 * Load the new SAM (json) schema
 */
export async function loadSamSchema(
  filePath: string,
  options: LoadSamSchemaSourceOptions = {},
): Promise<LoadResult<SamTemplateSchema>> {
  const loader = await Loader.fromSchemaFile<SamTemplateSchema>('SamTemplateSchema.schema.json', {
    mustValidate: options.validate,
    patcher: options.patcher,
  });

  const result = await loader.loadFile(filePath);
  assertSuccess(result);
  return result;
}
