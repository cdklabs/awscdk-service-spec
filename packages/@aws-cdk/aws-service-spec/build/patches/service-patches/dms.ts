import { fp, registerServicePatches } from './core';
import { patching, types } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  fp.patchResourceAt<types.CloudFormationRegistryResource['readOnlyProperties']>(
    'AWS::DMS::ReplicationConfig',
    '/readOnlyProperties',
    patching.Reason.sourceIssue('Incorrect case. Got upper case `/Properties` instead of `/properties'),
    (readOnlyProperties = []) => {
      for (const [idx, prop] of readOnlyProperties.entries()) {
        if (prop.startsWith('/Properties')) {
          readOnlyProperties[idx] = prop.replace('/Properties', '/properties');
        }
      }
      return readOnlyProperties;
    },
  ),
);
