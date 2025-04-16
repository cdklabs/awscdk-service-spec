import { fp, registerServicePatches } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

registerServicePatches(
    fp.addReadOnlyProperties(
        'AWS::Neptune::DBSubnetGroup',
        ['Id'],
        patching.Reason.sourceIssue('Id should be listed in readOnlyProperties.'),
      ),
);
