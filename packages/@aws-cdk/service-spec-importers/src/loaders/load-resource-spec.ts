import * as path from 'path';
import { combineLoadResults, Loader, LoadResult, LoadSourceOptions, mapLoadResult } from './loader';
import { applyPatchSet } from '../patching/json-patch-set';
import { CloudFormationResourceSpecification } from '../types';

export async function loadDefaultResourceSpecification(
  specDir: string,
  options: LoadSourceOptions = {},
): Promise<LoadResult<CloudFormationResourceSpecification>> {
  const loader = await Loader.fromSchemaFile<CloudFormationResourceSpecification>('ResourceSpecification.schema.json', {
    mustValidate: options.validate,
  });
  const quiet = !options.debug;

  const usEast1 = await applyPatchSet(path.join(specDir, 'us-east-1', '000_cloudformation'), { quiet });
  const usWest2 = await applyPatchSet(path.join(specDir, 'us-west-2', '000_cloudformation'), { quiet });

  const usEast1Result = await loader.load(usEast1);
  const usWest2Result = await loader.load(usWest2);

  const ret = mapLoadResult(combineLoadResults([usEast1Result, usWest2Result]), mergeSpecs);
  return ret;
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
