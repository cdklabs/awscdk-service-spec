import { ProblemReport, SamTemplateSchema, jsonschema } from '@aws-cdk/service-spec-sources';
import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { SamResources } from '../src/import-sam';

const standardCfnProperties: jsonschema.ObjectProperties = {
  Condition: {
    type: 'string',
  },
  DeletionPolicy: {
    enum: ['Delete', 'Retain', 'Snapshot'],
    type: 'string',
  },
  DependsOn: {
    anyOf: [
      {
        pattern: '^[a-zA-Z0-9]+$',
        type: 'string',
      },
      {
        items: {
          pattern: '^[a-zA-Z0-9]+$',
          type: 'string',
        },
        type: 'array',
      },
    ],
  },
  Metadata: {
    type: 'object',
  },
  UpdateReplacePolicy: {
    enum: ['Delete', 'Retain', 'Snapshot'],
    type: 'string',
  },
};

test('import SAM types by recognizing the Type field that accepts a constant', () => {
  const samSchema: SamTemplateSchema = {
    type: 'object',
    additionalProperties: false,
    definitions: {
      'AWS::Serverless::Thing1': {
        type: 'object',
        additionalProperties: false,
        properties: {
          ...standardCfnProperties,
          Type: {
            enum: ['AWS::Serverless::Thing'],
            type: 'string',
          },
          Properties: {
            type: 'object',
            additionalProperties: false,
            properties: {
              Architectures: {
                items: {
                  type: 'string',
                },
                type: 'array',
              },
              SomeTypedThing: {
                $ref: '#/definitions/AWS::Serverless::Thing1.Whatever',
              },
            },
          },
        },
        required: ['Type'],
      },
      'AWS::Serverless::Thing1.Whatever': {
        type: 'object',
        additionalProperties: false,
        properties: {
          PropField: { type: 'string' },
        },
      },
      'AWS::Serverless::Thing2': {
        type: 'object',
        additionalProperties: false,
        properties: {
          ...standardCfnProperties,
          Type: {
            const: 'AWS::Serverless::OtherThing',
            type: 'string',
          },
        },
        required: ['Type'],
      },
    },
    properties: {},
  };

  const db = emptyDatabase();
  const report = new ProblemReport();

  // WHEN
  new SamResources({ db, report, samSchema }).import();

  // THEN
  const thing = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Serverless::Thing').only();
  const type = db.follow('usesType', thing).find((x) => x.entity.name === 'Whatever');
  expect(type).toBeTruthy();

  db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Serverless::OtherThing').only();
});
