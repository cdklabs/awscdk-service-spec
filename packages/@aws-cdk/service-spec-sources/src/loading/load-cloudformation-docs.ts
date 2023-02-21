import * as path from 'path';
import { assertSuccess } from '@cdklabs/tskb';
import { Loader, SchemaValidation } from './loader';
import { CloudFormationDocumentation } from '../types';

export async function loadDefaultCloudFormationDocs(validate=SchemaValidation.FAIL): Promise<CloudFormationDocumentation> {
  const loader = await Loader.fromSchemaFile<CloudFormationDocumentation>('CloudFormationDocumentation.schema.json', validate);

  const result = await loader.loadFile(path.join(__dirname, '../../../../../sources/CloudFormationDocumentation/CloudFormationDocumentation.json'));
  assertSuccess(result);
  return result;
}
