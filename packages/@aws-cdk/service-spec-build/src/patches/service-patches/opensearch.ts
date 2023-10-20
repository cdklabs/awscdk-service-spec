import { fp, registerServicePatches } from './core';
import { Reason } from '../../patching';

registerServicePatches(
  fp.removeFromReadOnlyProperties(
    'AWS::OpenSearchService::Domain',
    ['DomainArn'],
    Reason.other(
      'Remove the DomainArn attribute of AWS::OpenSearchService::Domain resources, as it is unsupported by CloudFormation',
    ),
  ),
);
