import { addDefinitions, forResource, registerServicePatches, replaceDefinitionProperty } from './core';
import { Reason } from '../../patching';

/**
 * We enhance the types for IoT project
 */
registerServicePatches(
  forResource('AWS::IoT1Click::Project', (lens) => {
    const reason = Reason.other(
      'Set type of AWS::IoT1Click::Project.PlacementTemplate.DeviceTemplates to Map<String, AWS::IoT1Click::Project.DeviceTemplate>',
    );

    replaceDefinitionProperty(
      'PlacementTemplate',
      'DeviceTemplates',
      {
        type: 'object',
        additionalProperties: { $ref: '#/definitions/DeviceTemplate' },
      },
      reason,
    )(lens);

    addDefinitions(
      {
        DeviceTemplate: {
          type: 'object',
          additionalProperties: false,
          properties: {
            DeviceType: {
              type: 'string',
            },
            CallbackOverrides: {
              type: 'object',
            },
          },
        },
      },
      reason,
    )(lens);
  }),
);
