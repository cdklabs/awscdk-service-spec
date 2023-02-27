import * as path from 'path';
import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult } from './loader';
import { CloudFormationDocumentation } from '../types';

export async function loadDefaultCloudFormationDocs(
  mustValidate = true,
): Promise<LoadResult<CloudFormationDocumentation>> {
  const loader = await Loader.fromSchemaFile<CloudFormationDocumentation>('CloudFormationDocumentation.schema.json', {
    mustValidate,
  });

  const result = await loader.loadFile(
    path.join(__dirname, '../../../../../sources/CloudFormationDocumentation/CloudFormationDocumentation.json'),
  );
  assertSuccess(result);
  return result;
}
