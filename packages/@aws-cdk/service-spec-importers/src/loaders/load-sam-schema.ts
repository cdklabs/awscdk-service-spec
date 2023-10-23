import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { patchSamTemplateSpec } from '../patches/sam-patches';
import { SamTemplateSchema } from '../types';

/**
 * Load the new SAM (json) schema
 */
export async function loadSamSchema(
  filePath: string,
  options: LoadSourceOptions = {},
): Promise<LoadResult<SamTemplateSchema>> {
  const loader = await Loader.fromSchemaFile<SamTemplateSchema>('SamTemplateSchema.schema.json', {
    mustValidate: options.validate,
    patcher: patchSamTemplateSpec,
  });

  const result = await loader.loadFile(filePath);
  assertSuccess(result);
  return result;
}
