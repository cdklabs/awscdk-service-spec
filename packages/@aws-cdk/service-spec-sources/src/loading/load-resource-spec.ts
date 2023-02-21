import * as path from 'path';
import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult } from './loader';
import { ResourceSpecification } from '../types';

export async function loadDefaultResourceSpecification(
  mustValidate = true,
): Promise<LoadResult<ResourceSpecification>> {
  const loader = await Loader.fromSchemaFile<ResourceSpecification>('ResourceSpecification.schema.json', mustValidate);

  const result = await loader.loadFile(
    path.join(
      __dirname,
      '../../../../../sources/CloudFormationResourceSpecification/us-east-1/CloudFormationResourceSpecification.json',
    ),
  );
  assertSuccess(result);
  return result;
}
