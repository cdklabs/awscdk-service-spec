import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult, LoadSourceOptions } from './loader';
import { applyPatchSet } from '../patching/json-patch-set';
import { SAMResourceSpecification } from '../types';

/**
 * Load the old SAM spec (CloudFormation spec + extensions)
 */
export async function loadSamSpec(
  specDirectory: string,
  options: LoadSourceOptions,
): Promise<LoadResult<SAMResourceSpecification>> {
  const loader = await Loader.fromSchemaFile<SAMResourceSpecification>('SAMResourceSpecification.schema.json', {
    mustValidate: options.validate,
  });

  const spec = await applyPatchSet(specDirectory, { quiet: !options.debug });
  const result = await loader.load(spec);
  assertSuccess(result);

  return result;
}
