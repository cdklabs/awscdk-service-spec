import { Reason, addDefinitions, forResource, registerServicePatch, replaceResourceProperty } from './core';

/**
 * We enhance the types for IoT project
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
          AmbiguousRoleResolution: {
            type: 'string',
          },
          IdentityProvider: {
            type: 'string',
          },
          RulesConfiguration: {
            type: { $ref: '#/definitions/RulesConfigurationType' },
          },
          Type: {
            type: 'string',
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
