import { fp, registerServicePatches } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  fp.removeFromReadOnlyProperties(
    'AWS::OpenSearchService::Domain',
    ['DomainArn'],
    patching.Reason.other(
      'Remove the DomainArn attribute of AWS::OpenSearchService::Domain resources, as it is unsupported by CloudFormation',
    ),
  ),
);
