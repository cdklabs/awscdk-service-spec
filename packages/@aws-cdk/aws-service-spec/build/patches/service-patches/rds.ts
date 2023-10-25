import { fp, registerServicePatches } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  fp.addReadOnlyProperties(
    'AWS::RDS::DBCluster',
    ['ReadEndpoint'],
    patching.Reason.sourceIssue('ReadEndpoint should be listed in readOnlyProperties.'),
  ),
);
