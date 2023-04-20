import { addDefinitions, forResource, registerServicePatch, replaceResourceProperty } from './core';
import { Reason } from '../../patching';

/**
 * Make the use of the AWS::Cognito::IdentityPoolRoleAttachment.RoleMapings property safer
 *
 * This is typed as "arbitrary data", but we can do better. The old CloudFormation Spec
 * contained an unused type definition for "RoleMapping" which was probably intended to be used
 * in this place. The upconversion to Registry Schema doesn't include that definition
 * though so we copy it in by hand.
 *
 * This patch was never necessary, but it was done with the best of intentions.
 */
registerServicePatch(
  forResource('AWS::Cognito::IdentityPoolRoleAttachment', (lens) => {
    replaceResourceProperty(
      'RoleMappings',
      {
        type: 'object',
        additionalProperties: { $ref: '#/definitions/RoleMapping' },
      },
      Reason.other('Make the use of RoleMappings more type safe'),
    )(lens);

    addDefinitions(
      {
        RoleMapping: {
          type: 'object',
          additionalProperties: false,
          properties: {
            AmbiguousRoleResolution: {
              type: 'string',
            },
            IdentityProvider: {
              type: 'string',
            },
            RulesConfiguration: {
              $ref: '#/definitions/RulesConfigurationType',
            },
            Type: {
              type: 'string',
            },
          },
          required: ['Type'],
        },
        RulesConfigurationType: {
          type: 'object',
          additionalProperties: false,
          properties: {
            Rules: {
              type: 'array',
              items: { $ref: '#/definitions/MappingRule' },
            },
          },
          required: ['Rules'],
        },
        MappingRule: {
          type: 'object',
          additionalProperties: false,
          properties: {
            Claim: { type: 'string' },
            MatchType: { type: 'string' },
            RoleARN: { type: 'string' },
            Value: { type: 'string' },
          },
          required: ['Claim', 'MatchType', 'RoleARN', 'Value'],
        },
      },

      Reason.other('Make the use of RoleMappings more type safe'),
    )(lens);
  }),
);
