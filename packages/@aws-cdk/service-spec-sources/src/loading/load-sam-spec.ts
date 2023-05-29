import * as path from 'path';
import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult } from './loader';
import { applyPatchSet } from '../patching/json-patch-set';
import { SAMResourceSpecification } from '../types';

/**
 * Load the old SAM spec (CloudFormation spec + extensions)
 */
export async function loadSamSpec(mustValidate = true): Promise<LoadResult<SAMResourceSpecification>> {
  const loader = await Loader.fromSchemaFile<SAMResourceSpecification>('SAMResourceSpecification.schema.json', {
    mustValidate,
  });

  const cfnSpecDir = path.join(__dirname, '../../../../../sources/CloudFormationResourceSpecification');
  const usEast1 = applyPatchSet(path.join(cfnSpecDir, 'us-east-1', '100_sam'));

  const usEast1Result = await loader.load(usEast1);
  assertSuccess(usEast1Result);

  return usEast1Result;
}
