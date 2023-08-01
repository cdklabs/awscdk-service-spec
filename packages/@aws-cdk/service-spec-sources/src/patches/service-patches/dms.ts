import { fp, registerServicePatches } from './core';
import { Reason } from '../../patching';
import { CloudFormationRegistryResource } from '../../types';

registerServicePatches(
  fp.patchResourceAt<CloudFormationRegistryResource['readOnlyProperties']>(
    'AWS::DMS::ReplicationConfig',
    '/readOnlyProperties',
    Reason.sourceIssue('Incorrect case. Got upper case `/Properties` instead of `/properties'),
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
