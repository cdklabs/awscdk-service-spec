import { fp, registerServicePatches } from './core';
import { Reason } from '../../patching';

registerServicePatches(
  fp.removeFromReadOnlyProperties(
    'AWS::Elasticsearch::Domain',
    ['DomainArn'],
    Reason.other(
      'Remove the deprecated attribute DomainArn, as the new preferred attribute Arn maps to the same name in the generated code',
    ),
  ),
);
