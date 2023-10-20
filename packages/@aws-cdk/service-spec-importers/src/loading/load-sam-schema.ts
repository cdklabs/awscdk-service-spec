import * as path from 'path';
import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult } from './loader';
import { patchSamTemplateSpec } from '../patches/sam-patches';
import { SamTemplateSchema } from '../types';

/**
 * Load the new SAM (json) schema
 */
export async function loadSamSchema(mustValidate = true): Promise<LoadResult<SamTemplateSchema>> {
  const loader = await Loader.fromSchemaFile<SamTemplateSchema>('SamTemplateSchema.schema.json', {
    mustValidate,
    patcher: patchSamTemplateSpec,
  });

  const result = await loader.loadFile(path.join(__dirname, '../../../../../sources/SAMSpec/sam.schema.json'));
  assertSuccess(result);
  return result;
}
