import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { normalizeJsonSchema } from '../patches';
import { JsonLensPatcher } from '../patching';
import { SamTemplateSchema } from '../types';

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
    patcher: options.patcher ?? normalizeJsonSchema,
  });

  const result = await loader.loadFile(filePath);
  assertSuccess(result);
  return result;
}
