import * as path from 'path';
import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult } from './loader';
import { SAMResourceSpecification } from '../types';

/**
 * Load the old SAM spec (CloudFormation spec + extensions)
 */
export async function loadSamSpec(mustValidate = true): Promise<LoadResult<SAMResourceSpecification>> {
  const loader = await Loader.fromSchemaFile<SAMResourceSpecification>('SAMResourceSpecification.schema.json', {
    mustValidate,
  });

  const result = await loader.loadFile(
    path.join(__dirname, '../../../../../sources/CloudFormationResourceSpecification/us-east-1/sam.json'),
  );
  assertSuccess(result);
  return result;
}
