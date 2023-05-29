import * as path from 'path';
import { combineLoadResults, Loader, LoadResult, mapLoadResult } from './loader';
import { CloudFormationResourceSpecification } from '../types';
import { applyPatchSet } from '../patching/json-patch-set';

export async function loadDefaultResourceSpecification(
  mustValidate = true,
): Promise<LoadResult<CloudFormationResourceSpecification>> {
  const loader = await Loader.fromSchemaFile<CloudFormationResourceSpecification>('ResourceSpecification.schema.json', {
    mustValidate,
  });

  const cfnSpecDir = path.join(__dirname, '../../../../../sources/CloudFormationResourceSpecification');
  const usEast1 = applyPatchSet(path.join(cfnSpecDir, 'us-east-1', '000_cloudformation'));
  const usWest2 = applyPatchSet(path.join(cfnSpecDir, 'us-west-2', '000_cloudformation'));

  const usEast1Result = await loader.load(usEast1);
  const usWest2Result = await loader.load(usWest2);

  return mapLoadResult(combineLoadResults([usEast1Result, usWest2Result]), mergeSpecs);
}

function mergeSpecs(xs: CloudFormationResourceSpecification[]) {
  for (let i = 1; i < xs.length; i++) {
    for (const [propKey, propValue] of Object.entries(xs[i].PropertyTypes)) {
      xs[0].PropertyTypes[propKey] = propValue;
    }
    for (const [resKey, resValue] of Object.entries(xs[i].ResourceTypes)) {
      xs[0].ResourceTypes[resKey] = resValue;
    }
  }

  return xs[0];
}
