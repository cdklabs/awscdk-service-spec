import { normalizeJsonSchema } from './json-schema-patches';
import { addDefinitions, replaceDefinitionProperty } from './service-patches/core';
import { JsonObjectLens, JsonObjectPatcher, Patcher, Reason, makeCompositePatcher, onlyObjects } from '../patching';
import { jsonschema } from '../types';

const deploymentPreferenceHooks: Patcher<JsonObjectLens> = (lens) => {
  const reason = Reason.sourceIssue('Use of pattern properties but type is actually well-known.');

  replaceDefinitionProperty(
    'AWS::Serverless::Function.DeploymentPreference',
    'Hooks',
    {
      $ref: '#/definitions/AWS::Serverless::Function.Hooks',
    },
    reason,
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
    reason,
  )(lens);
};

const apiEndpointConfiguration: Patcher<JsonObjectLens> = (lens) => {
  const reason = Reason.backwardsCompat();

  replaceSamResourceProperty(
    'AWS::Serverless::Api',
    'EndpointConfiguration',
    {
      anyOf: [{ $ref: '#/definitions/AWS::Serverless::Api.EndpointConfiguration' }, { type: 'string' }],
    },
    reason,
  )(lens);
};

/**
 * Patchers that apply to the SAM Template spec file
 */
export const patchSamTemplateSpec = makeCompositePatcher(
  normalizeJsonSchema,
  onlyObjects(makeCompositePatcher(deploymentPreferenceHooks, apiEndpointConfiguration)),
);

/**
 * Replace the property of a SAM Resource.
 *
 * NOTE: returns a new patcher. Still needs to be applied to a lens.
 */
function replaceSamResourceProperty(
  resource: string,
  propertyName: string,
  newSchema: jsonschema.Schema,
  reason: Reason,
): JsonObjectPatcher {
  return (lens) => {
    if (lens.jsonPointer === `/definitions/${resource}/properties/Properties/properties/${propertyName}`) {
      lens.replaceValue(reason.reason, newSchema);
    }
  };
}
