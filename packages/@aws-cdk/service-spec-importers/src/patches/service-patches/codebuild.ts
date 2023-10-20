import { addDefinitions, forResource, registerServicePatches, replaceDefinition } from './core';
import { Reason } from '../../patching';

/**
 * Add missing types for AWS::CodeBuild::Project
 */
registerServicePatches(
  forResource('AWS::CodeBuild::Project', (lens) => {
    const reason = Reason.sourceIssue(
      'The elements of AWS::CodeBuild::Project.Triggers.FilterGroups used to be well-typed in the Resource Specification. In the Resource Schema it is incorrectly an untyped object.',
    );

    replaceDefinition(
      'FilterGroup',
      {
        type: 'array',
        items: { $ref: '#/definitions/WebhookFilter' },
      },
      reason,
    )(lens);

    addDefinitions(
      {
        WebhookFilter: {
          type: 'object',
          properties: {
            Pattern: { type: 'string' },
            Type: { type: 'string' },
            ExcludeMatchedPattern: { type: 'boolean' },
          },
          required: ['Pattern', 'Type'],
          additionalProperties: false,
        },
      },
      reason,
    )(lens);
  }),
);
