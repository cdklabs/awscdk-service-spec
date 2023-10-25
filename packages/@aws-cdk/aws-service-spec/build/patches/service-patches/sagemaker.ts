import { addDefinitions, forResource, registerServicePatches, replaceDefinitionProperty } from './core';
import { patching } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  forResource('AWS::SageMaker::ModelCard', (lens) => {
    const reason = patching.Reason.upstreamTypeNameChange('Was a single type, is now multiple XOR types.');

    replaceDefinitionProperty(
      'MetricGroup',
      'MetricData',
      {
        type: 'array',
        insertionOrder: true,
        items: {
          $ref: '#/definitions/MetricDataItems',
        },
      },
      reason,
    )(lens);

    addDefinitions(
      {
        MetricDataItems: {
          type: 'object',
          required: ['Name', 'Type', 'Value'],
          properties: {
            Name: {
              type: 'string',
              pattern: '.{1,255}',
            },
            Notes: {
              type: 'string',
              maxLength: 1024,
            },
            Type: {
              type: 'string',
              enum: ['number', 'string', 'boolean', 'linear_graph', 'bar_chart', 'matrix'],
            },
            Value: {
              type: 'object',
            },
            XAxisName: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            YAxisName: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
        },
      },
      reason,
    )(lens);
  }),
);
