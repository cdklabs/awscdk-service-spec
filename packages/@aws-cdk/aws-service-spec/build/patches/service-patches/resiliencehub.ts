import { forResource, registerServicePatches, replaceDefinition } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  forResource('AWS::ResilienceHub::ResiliencyPolicy', (lens) => {
    const reason = patching.Reason.upstreamTypeNameChange();
    replaceDefinition(
      'PolicyMap',
      {
        type: 'object',
        patternProperties: {
          '.*{1,8}': { $ref: '#/definitions/FailurePolicy' },
        },
        additionalProperties: false,
      },
      reason,
    )(lens);
  }),
);
