import { fp, registerServicePatches } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  fp.removeFromReadOnlyProperties(
    'AWS::Elasticsearch::Domain',
    ['DomainArn'],
    patching.Reason.other(
      'Remove the deprecated attribute DomainArn, as the new preferred attribute Arn maps to the same name in the generated code',
    ),
  ),
);
