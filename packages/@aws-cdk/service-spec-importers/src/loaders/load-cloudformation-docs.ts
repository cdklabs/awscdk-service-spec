import { assertSuccess } from '@cdklabs/tskb';
import { Loader, LoadResult, LoadSourceOptions as LoadSourceOptions } from './loader';
import { CloudFormationDocumentation } from '../types';

export async function loadDefaultCloudFormationDocs(
  filePath: string,
  options: LoadSourceOptions = {},
): Promise<LoadResult<CloudFormationDocumentation>> {
  const loader = await Loader.fromSchemaFile<CloudFormationDocumentation>('CloudFormationDocumentation.schema.json', {
    mustValidate: options.validate,
  });

  const result = await loader.loadFile(filePath);
  assertSuccess(result);
  return result;
}
