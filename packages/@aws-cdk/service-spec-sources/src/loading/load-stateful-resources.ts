import * as path from 'path';
import { assertSuccess } from '@cdklabs/tskb';
import { Loader, SchemaValidation } from './loader';
import { StatefulResources } from '../types';

export async function loadDefaultStatefulResources(validate = SchemaValidation.FAIL): Promise<StatefulResources> {
  const loader = await Loader.fromSchemaFile<StatefulResources>('StatefulResources.schema.json', validate);

  const result = await loader.loadFile(
    path.join(__dirname, '../../../../../sources/StatefulResources/StatefulResources.json'),
  );
  assertSuccess(result);
  return result;
}
