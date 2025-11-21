import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { importEventBridgeSchema } from '../src/importers/import-eventbridge-schema';
import { ProblemReport } from '../src/report';
import { EventBridgeSchema } from '../src/types';

let db: ReturnType<typeof emptyDatabase>;
let report: ProblemReport;
beforeEach(() => {
  db = emptyDatabase();
  report = new ProblemReport();

  const service = db.allocate('service', {
    name: 'aws-test',
    shortName: 'test',
    capitalized: 'Test',
    cloudFormationNamespace: 'AWS::Test',
  });

  const resource = db.allocate('resource', {
    cloudFormationType: 'AWS::Test::HookVersion',
    name: 'HookVersion',
    properties: {
      SimpleProperty: { type: { type: 'string' } },
      RoleArn: { type: { type: 'string' } },
    },
    attributes: {},
  });

  db.link('hasResource', service, resource);
});

test('EventBridge event with matching resource', () => {
  importEventBridgeSchema({
    db,
    report,
    event: {
      SchemaName: 'aws.test@ObjectCreated',
      Description: 'Schema for event type ObjectCreated, published by AWS service aws.s3',
      Content: {
        components: {
          schemas: {
            AWSEvent: {
              'x-amazon-events-detail-type': 'Object Created',
              'x-amazon-events-source': 'aws.test',
              properties: {
                detail: {
                  $ref: '#/components/schemas/ObjectCreated',
                },
              },
            },
            ObjectCreated: {
              type: 'object',
              required: ['HookVersion'],
              properties: {
                hookVersion: {
                  $ref: '#/components/schemas/HookVersion',
                },
                'request-id': {
                  type: 'string',
                },
              },
            },
            HookVersion: {
              type: 'object',
              required: ['name'],
              properties: {
                name: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    } as EventBridgeSchema,
  });
  const event = db.lookup('event', 'name', 'equals', 'aws.test@ObjectCreated').only();

  // check types
  const rootType = db.get('eventTypeDefinition', event.rootProperty.$ref);
  expect(rootType).toMatchObject({
    name: 'ObjectCreated',
    properties: {
      hookVersion: { type: { type: 'ref' } },
      'request-id': { type: { type: 'string' } },
    },
  });

  // @ts-ignore
  const referenceType = db.get('eventTypeDefinition', rootType.properties.hookVersion.type.reference);
  expect(referenceType).toMatchObject({
    name: 'HookVersion',
    properties: {
      name: { type: { type: 'string' } },
    },
  });

  // check the event
  expect(event).toMatchObject({
    name: 'aws.test@ObjectCreated',
    source: 'aws.test',
    detailType: 'Object Created',
    description: 'Schema for event type ObjectCreated, published by AWS service aws.s3',
    rootProperty: { $ref: rootType.$id },
    resourcesField: [
      {
        type: {
          $ref: referenceType.$id,
        },
      },
    ],
  });

  const eventTypes = db.follow('eventUsesType', event).map((x) => x.entity);
  expect(eventTypes).toHaveLength(2);
  expect(eventTypes).toContain(referenceType);
  expect(eventTypes).toContain(rootType);

  // Check the relationship between resource and events
  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::HookVersion').only();
  const resourceHasEvent = db.follow('resourceHasEvent', resource).only();
  expect(resourceHasEvent.entity).toMatchObject(event);
});

test('EventBridge event have hyphens field name with matching resource', () => {
  importEventBridgeSchema({
    db,
    report,
    event: {
      SchemaName: 'aws.test@ObjectCreated',
      Description: 'Schema for event type ObjectCreated, published by AWS service aws.s3',
      Content: {
        components: {
          schemas: {
            AWSEvent: {
              'x-amazon-events-detail-type': 'Object Created',
              'x-amazon-events-source': 'aws.test',
              properties: {
                detail: {
                  $ref: '#/components/schemas/ObjectCreated',
                },
              },
            },
            ObjectCreated: {
              type: 'object',
              required: ['Hook-Version'],
              properties: {
                'Hook-Version': {
                  $ref: '#/components/schemas/Hook-Version',
                },
                'request-id': {
                  type: 'string',
                },
              },
            },
            'Hook-Version': {
              type: 'object',
              required: ['name'],
              properties: {
                name: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    } as EventBridgeSchema,
  });
  const event = db.lookup('event', 'name', 'equals', 'aws.test@ObjectCreated').only();

  // check types
  const rootType = db.get('eventTypeDefinition', event.rootProperty.$ref);
  expect(rootType).toMatchObject({
    name: 'ObjectCreated',
    properties: {
      'Hook-Version': { type: { type: 'ref' } },
      'request-id': { type: { type: 'string' } },
    },
  });

  // @ts-ignore
  const referenceType = db.get('eventTypeDefinition', rootType.properties['Hook-Version'].type.reference);
  expect(referenceType).toMatchObject({
    name: 'Hook-Version',
    properties: {
      name: { type: { type: 'string' } },
    },
  });

  // check the event
  expect(event).toMatchObject({
    name: 'aws.test@ObjectCreated',
    source: 'aws.test',
    detailType: 'Object Created',
    description: 'Schema for event type ObjectCreated, published by AWS service aws.s3',
    rootProperty: { $ref: rootType.$id },
    resourcesField: [
      {
        type: {
          $ref: referenceType.$id,
        },
      },
    ],
  });

  const eventTypes = db.follow('eventUsesType', event).map((x) => x.entity);
  expect(eventTypes).toHaveLength(2);
  expect(eventTypes).toContain(referenceType);
  expect(eventTypes).toContain(rootType);

  // Check the relationship between resource and events
  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::HookVersion').only();
  const resourceHasEvent = db.follow('resourceHasEvent', resource).only();
  expect(resourceHasEvent.entity).toMatchObject(event);
});

test('EventBridge event with no matching event field', () => {
  importEventBridgeSchema({
    db,
    report,
    event: {
      SchemaName: 'aws.test@ObjectCreated',
      Description: 'Schema for event type ObjectCreated, published by AWS service aws.s3',
      Content: {
        components: {
          schemas: {
            AWSEvent: {
              'x-amazon-events-detail-type': 'Object Created',
              'x-amazon-events-source': 'aws.test',
              properties: {
                detail: {
                  $ref: '#/components/schemas/ObjectCreated',
                },
              },
            },
            ObjectCreated: {
              type: 'object',
              properties: {
                hookVersion: {
                  $ref: '#/components/schemas/HookVersion',
                },
                'request-id': {
                  type: 'string',
                },
              },
            },
            HookVersion: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    } as EventBridgeSchema,
  });
  const event = db.lookup('event', 'name', 'equals', 'aws.test@ObjectCreated').only();

  const rootType = db.get('eventTypeDefinition', event.rootProperty.$ref);
  expect(rootType).toMatchObject({
    name: 'ObjectCreated',
    properties: {
      hookVersion: { type: { type: 'ref' } },
      'request-id': { type: { type: 'string' } },
    },
  });

  // @ts-ignore
  const referenceType = db.get('eventTypeDefinition', rootType.properties.hookVersion.type.reference);
  expect(referenceType).toMatchObject({
    name: 'HookVersion',
    properties: {
      name: { type: { type: 'string' } },
    },
  });

  // Check the event

  expect(event).toMatchObject({
    name: 'aws.test@ObjectCreated',
    source: 'aws.test',
    detailType: 'Object Created',
    description: 'Schema for event type ObjectCreated, published by AWS service aws.s3',
    rootProperty: { $ref: rootType.$id },
    resourcesField: [],
  });

  // check types
  const eventTypes = db.follow('eventUsesType', event).map((x) => x.entity);
  expect(eventTypes).toHaveLength(2);
  expect(eventTypes).toContain(referenceType);
  expect(eventTypes).toContain(rootType);

  // Check the relationship between resource and events
  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::HookVersion').only();
  expect(db.follow('resourceHasEvent', resource)).toHaveLength(0);
});

test('EventBridge event with non existing service', () => {
  const serviceName = 'nonExistingService';
  importEventBridgeSchema({
    db,
    report,
    event: {
      SchemaName: `aws.${serviceName}@ObjectCreated`,
      Description: `Schema for event type ObjectCreated, published by AWS service aws.${serviceName}`,
      Content: {
        components: {
          schemas: {
            AWSEvent: {
              'x-amazon-events-detail-type': 'Object Created',
              'x-amazon-events-source': `aws.${serviceName}`,
              properties: {
                detail: {
                  $ref: '#/components/schemas/ObjectCreated',
                },
              },
            },
            ObjectCreated: {
              type: 'object',
              required: ['HookVersion'],
              properties: {
                hookVersion: {
                  $ref: '#/components/schemas/HookVersion',
                },
                'request-id': {
                  type: 'string',
                },
              },
            },
            HookVersion: {
              type: 'object',
              required: ['name'],
              properties: {
                name: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    } as EventBridgeSchema,
  });

  const event = db.lookup('event', 'name', 'equals', `aws.${serviceName}@ObjectCreated`).only();

  const rootType = db.get('eventTypeDefinition', event.rootProperty.$ref);
  expect(rootType).toMatchObject({
    name: 'ObjectCreated',
    properties: {
      hookVersion: { type: { type: 'ref' } },
      'request-id': { type: { type: 'string' } },
    },
  });

  // @ts-ignore
  const referenceType = db.get('eventTypeDefinition', rootType.properties.hookVersion.type.reference);
  expect(referenceType).toMatchObject({
    name: 'HookVersion',
    properties: {
      name: { type: { type: 'string' } },
    },
  });

  expect(event).toMatchObject({
    name: `aws.${serviceName}@ObjectCreated`,
    source: `aws.${serviceName}`,
    detailType: 'Object Created',
    description: `Schema for event type ObjectCreated, published by AWS service aws.${serviceName}`,
    rootProperty: { $ref: rootType.$id },
    resourcesField: [],
  });

  // check types
  const eventTypes = db.follow('eventUsesType', event).map((x) => x.entity);
  expect(eventTypes).toHaveLength(2);
  expect(eventTypes).toContain(referenceType);
  expect(eventTypes).toContain(rootType);

  // Check the relationship between resource and events
  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::HookVersion').only();
  expect(db.follow('resourceHasEvent', resource)).toHaveLength(0);
});
