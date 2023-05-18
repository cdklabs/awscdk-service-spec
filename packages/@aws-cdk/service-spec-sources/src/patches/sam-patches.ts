import { normalizeJsonSchema } from './json-schema-patches';
import { addDefinitions, replaceDefinitionProperty } from './service-patches/core';
import { JsonObjectLens, Patcher, Reason, makeCompositePatcher, onlyObjects } from '../patching';

const deploymentPreferenceHooks: Patcher<JsonObjectLens> = (lens) => {
  const hooksTypeReason = Reason.sourceIssue('Use of pattern properties but type is actually well-known.');

  replaceDefinitionProperty(
    'AWS::Serverless::Function.DeploymentPreference',
    'Hooks',
    {
      $ref: '#/definitions/AWS::Serverless::Function.Hooks',
    },
    hooksTypeReason,
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
    hooksTypeReason,
  )(lens);
};

/**
 * Patchers that apply to the SAM Template spec file
 */
export const patchSamTemplateSpec = makeCompositePatcher(normalizeJsonSchema, onlyObjects(deploymentPreferenceHooks));
