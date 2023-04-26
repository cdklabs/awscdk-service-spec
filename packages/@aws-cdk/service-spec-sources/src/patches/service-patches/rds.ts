import { fp, registerServicePatches } from './core';
import { Reason } from '../../patching';

registerServicePatches(
  fp.addReadOnlyProperties(
    'AWS::RDS::DBCluster',
    ['ReadEndpoint'],
    Reason.sourceIssue('ReadEndpoint should be listed in readOnlyProperties.'),
  ),
);
