import * as path from 'path';
import { assertSuccess } from "@cdklabs/tskb";
import { ResourceSpecification } from "../types";
import { Loader, SchemaValidation } from "./loader";

export async function loadDefaultResourceSpecification(validate=SchemaValidation.FAIL): Promise<ResourceSpecification> {
  const loader = await Loader.fromSchemaFile<ResourceSpecification>('ResourceSpecification.schema.json', validate);

  const result =  await loader.loadFile(path.join(__dirname, '../../../../sources/CloudFormationResourceSpecification/us-east-1/CloudFormationResourceSpecification.json'));
  assertSuccess(result);
  return result;
}