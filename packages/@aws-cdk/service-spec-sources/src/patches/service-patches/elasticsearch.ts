import { fp, registerServicePatch } from './core';
import { Reason } from '../../patching';
import { CloudFormationRegistryResource } from '../../types';

registerServicePatch(
  fp.patchResourceAt<CloudFormationRegistryResource['readOnlyProperties']>(
    'AWS::Elasticsearch::Domain',
    '/readOnlyProperties',
    Reason.other(
      'Remove the deprecated attribute DomainArn, as the new preferred attribute Arn maps to the same name in the generated code',
    ),
    (readOnlyProperties) => {
      const idx = readOnlyProperties?.indexOf('/properties/DomainArn');
      if (idx !== undefined && idx >= 0) {
        delete readOnlyProperties?.[idx];
      }
      return readOnlyProperties;
    },
  ),
);
