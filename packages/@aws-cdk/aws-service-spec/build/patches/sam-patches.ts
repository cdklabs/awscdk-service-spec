import { patching, patches, types } from '@aws-cdk/service-spec-importers';
import { addDefinitions, replaceDefinition, replaceDefinitionProperty } from './service-patches/core';

const serverlessApi: patching.Patcher<patching.JsonObjectLens> = (lens) => {
  replaceSamResourceProperty(
    'AWS::Serverless::Api',
    'EndpointConfiguration',
    {
      anyOf: [{ $ref: '#/definitions/AWS::Serverless::Api.EndpointConfiguration' }, { type: 'string' }],
    },
    patching.Reason.backwardsCompat(
      'Make the EndpointConfiguration property of AWS::Serverless::Api have a union type',
    ),
  )(lens);

  replaceSamResourceProperty(
    'AWS::Serverless::Api',
    'GatewayResponses',
    { type: 'object' },
    patching.Reason.backwardsCompat('Make the GatewayResponses property of AWS::Serverless::Api accept JSON'),
  )(lens);
  replaceSamResourceProperty(
    'AWS::Serverless::Api',
    'Models',
    { type: 'object' },
    patching.Reason.backwardsCompat('Make the Models property of AWS::Serverless::Api accept JSON'),
  )(lens);
};

const serverlessFunction: patching.Patcher<patching.JsonObjectLens> = (lens) => {
  const hooksReason = patching.Reason.sourceIssue('Use of pattern properties but type is actually well-known.');

  replaceDefinitionProperty(
    'AWS::Serverless::Function.DeploymentPreference',
    'Hooks',
    {
      $ref: '#/definitions/AWS::Serverless::Function.Hooks',
    },
    hooksReason,
  )(lens);

  addDefinitions(
    {
      'AWS::Serverless::Function.Hooks': {
        type: 'object',
        properties: {
          PreTraffic: { type: 'string' },
          PostTraffic: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    hooksReason,
  )(lens);

  replaceDefinitionProperty(
    'AWS::Serverless::Function.IAMPolicyDocument',
    'Statement',
    {
      type: 'object',
    },
    patching.Reason.backwardsCompat(
      'This was once typed as Json, and adding types now is a breaking change. Keep them as Json forever',
    ),
  )(lens);

  replaceDefinition(
    'AWS::Serverless::Function.AlexaSkillEvent',
    {
      properties: {
        SkillId: { type: 'string' },
      },
      additionalProperties: false,
      type: 'object',
      required: ['SkillId'],
    },
    patching.Reason.sourceIssue('SAM docs claim this is optional, but it is the only possible property'),
  )(lens);
};

const serverlessStateMachine: patching.Patcher<patching.JsonObjectLens> = (lens) => {
  replaceDefinitionProperty(
    'AWS::Serverless::StateMachine.IAMPolicyDocument',
    'Statement',
    {
      type: 'object',
    },
    patching.Reason.backwardsCompat(
      'This was once typed as Json, and adding types now is a breaking change. Keep them as Json forever',
    ),
  )(lens);
};

/**
 * Patchers that apply to the SAM Template spec file
 */
export const patchSamTemplateSpec = patching.makeCompositePatcher(
  patches.normalizeJsonSchema,
  patching.onlyObjects(patching.makeCompositePatcher(serverlessApi, serverlessFunction, serverlessStateMachine)),
);

/**
 * Replace the property of a SAM Resource.
 *
 * NOTE: returns a new patcher. Still needs to be applied to a lens.
 */
function replaceSamResourceProperty(
  resource: string,
  propertyName: string,
  newSchema: types.jsonschema.Schema,
  reason: patching.Reason,
): patching.JsonObjectPatcher {
  return (lens) => {
    if (lens.jsonPointer === `/definitions/${resource}/properties/Properties/properties/${propertyName}`) {
      lens.replaceValue(reason.reason, newSchema);
    }
  };
}
