import { patching } from '@aws-cdk/service-spec-importers';
import { forResource, registerServicePatches, replaceDefinition } from './core';

registerServicePatches(
  forResource('AWS::B2BI::Partnership', (lens) => {
    const reason = patching.Reason.sourceIssue(
      'Capabilities property is marked as required by service team. Revert it to prevent regression',
    );
    replaceDefinition(
      'B2BIPartnernshipProperties',
      {
        required:[ "Email", "Name", "ProfileId" ]
      },
      reason,
    )(lens);
  })
);