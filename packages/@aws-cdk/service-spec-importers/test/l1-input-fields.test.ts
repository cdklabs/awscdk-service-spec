import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';
import { importCloudFormationRegistryResource } from '../src/importers/import-cloudformation-registry';
import { ResourceSpecImporter } from '../src/importers/import-resource-spec';
import { findMissingInputFields, formatMissingInputFields, missingInputFields } from '../src/l1-input-fields';
import { ProblemReport } from '../src/report';
import { CloudFormationRegistryResource, jsonschema } from '../src/types';

const RESOURCE = 'AWS::Some::Type';

const renamed = registryResource({
  properties: {
    Destinations: { type: 'array', items: { $ref: '#/definitions/Destination' } },
    Settings: { $ref: '#/definitions/Settings' },
  },
  definitions: {
    Destination: object({ StreamName: { type: 'string' }, Network: { type: 'string' }, Ip: { type: 'string' } }),
    Settings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }),
  },
});
const notRenamed = registryResource({
  properties: {
    Destinations: { type: 'array', items: { $ref: '#/definitions/DestinationRequest' } },
    Settings: { $ref: '#/definitions/SettingsRequest' },
  },
  definitions: {
    DestinationRequest: object({ StreamName: { type: 'string' } }),
    SettingsRequest: object({ Url: { type: 'string' } }),
  },
});

let db: SpecDatabase;
beforeEach(() => {
  db = emptyDatabase();
});

test('a field that CloudFormation accepts as input is missing when the L1 renders a struct without it', () => {
  // The region imported last has not renamed the structs yet, so the L1 renders the old ones
  import_(renamed, 'us-east-1');
  import_(notRenamed, 'us-west-2');

  expect(missingInputFields(db, renamed)).toEqual(['Destinations/*/Ip', 'Destinations/*/Network', 'Settings/Port']);
  expect(missingInputFields(db, notRenamed)).toEqual([]);
});

test('a missing field is found below every field of a struct', () => {
  const nested = (metadata: string, metadataFields: jsonschema.ObjectProperties) =>
    registryResource({
      properties: { Pod: { $ref: '#/definitions/Pod' } },
      definitions: {
        Pod: object({
          Containers: { $ref: '#/definitions/Container' },
          Metadata: { $ref: `#/definitions/${metadata}` },
        }),
        Container: object({ Image: { type: 'string' } }),
        [metadata]: object(metadataFields),
      },
    });
  const current = nested('EksMetadata', { Labels: { type: 'string' }, Namespace: { type: 'string' } });
  import_(current, 'us-east-1');
  import_(nested('Metadata', { Labels: { type: 'string' } }), 'us-west-2');

  expect(missingInputFields(db, current)).toEqual(['Pod/Metadata/Namespace']);
});

test('read-only fields are not input', () => {
  import_(renamed, 'us-east-1');
  import_(notRenamed, 'us-west-2');

  const withReadOnly = {
    ...renamed,
    readOnlyProperties: ['/properties/Destinations/*/Ip', '/properties/Settings/Port'],
  };

  expect(missingInputFields(db, withReadOnly)).toEqual(['Destinations/*/Network']);
});

test('a field that is both read-only and create-only is input', () => {
  import_(renamed, 'us-east-1');
  import_(notRenamed, 'us-west-2');

  const withCreateOnly = {
    ...renamed,
    readOnlyProperties: ['/properties/Settings/Port'],
    createOnlyProperties: ['/properties/Settings/Port'],
  };

  expect(missingInputFields(db, withCreateOnly)).toEqual([
    'Destinations/*/Ip',
    'Destinations/*/Network',
    'Settings/Port',
  ]);
});

test('a read-only field of a struct at one place is input where the same struct is used at another place', () => {
  const endpoints = (definition: string, fields: jsonschema.ObjectProperties) =>
    registryResource({
      properties: {
        Primary: { $ref: `#/definitions/${definition}` },
        Secondary: { $ref: `#/definitions/${definition}` },
      },
      definitions: { [definition]: object(fields) },
    });
  const current = {
    ...endpoints('Endpoint', { Name: { type: 'string' }, Address: { type: 'string' } }),
    readOnlyProperties: ['/properties/Primary/Address'],
  };
  import_(current, 'us-east-1');
  import_(endpoints('EndpointRequest', { Name: { type: 'string' } }), 'us-west-2');

  expect(missingInputFields(db, current)).toEqual(['Secondary/Address']);
});

test('a property renders its oldest type, so a field that only a later type of another shape has is missing', () => {
  ResourceSpecImporter.importTypes({
    db,
    specification: {
      ResourceSpecificationVersion: '0',
      ResourceTypes: { [RESOURCE]: { Properties: { Settings: { Type: 'SettingsRequest', UpdateType: 'Mutable' } } } },
      PropertyTypes: {
        [`${RESOURCE}.SettingsRequest`]: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
      },
    },
  });
  const current = registryResource({
    properties: { Settings: { type: 'array', items: { $ref: '#/definitions/Settings' } } },
    definitions: { Settings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
  });
  import_(current);

  expect(missingInputFields(db, current)).toEqual(['Settings/*/Port']);
});

test('a struct field renders its oldest type, so a field that only a later type of another shape has is missing', () => {
  ResourceSpecImporter.importTypes({
    db,
    specification: {
      ResourceSpecificationVersion: '0',
      ResourceTypes: { [RESOURCE]: { Properties: { Pod: { Type: 'Pod', UpdateType: 'Mutable' } } } },
      PropertyTypes: {
        [`${RESOURCE}.Pod`]: { Properties: { Filter: { Type: 'FilterRequest', UpdateType: 'Mutable' } } },
        [`${RESOURCE}.FilterRequest`]: { Properties: { Name: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
      },
    },
  });
  const current = registryResource({
    properties: { Pod: { $ref: '#/definitions/Pod' } },
    definitions: {
      Pod: object({ Filter: { type: 'array', items: { $ref: '#/definitions/Filter' } } }),
      Filter: object({ Name: { type: 'string' }, Values: { type: 'array', items: { type: 'string' } } }),
    },
  });
  import_(current);

  expect(missingInputFields(db, current)).toEqual(['Pod/Filter/*/Values']);
});

test('the structs of a union are compared with the rendered structs of the same name', () => {
  const schema = registryResource({
    properties: { Target: { oneOf: [{ $ref: '#/definitions/Queue' }, { $ref: '#/definitions/Topic' }] } },
    definitions: {
      Queue: object({ Settings: { $ref: '#/definitions/QueueSettings' } }),
      Topic: object({ Settings: { $ref: '#/definitions/TopicSettings' } }),
      QueueSettings: object({ Delay: { type: 'integer' } }),
      TopicSettings: object({ Protocol: { type: 'string' } }),
    },
  });
  import_(schema);

  // An L1 built from the schema itself has every field of it
  expect(missingInputFields(db, schema)).toEqual([]);
});

test('the tag property is not checked, because CDK renders it with the tag manager', () => {
  const tagged = (tagFields: jsonschema.ObjectProperties) =>
    registryResource({
      properties: { Tags: { type: 'array', items: { $ref: '#/definitions/Tag' } } },
      definitions: { Tag: object(tagFields) },
      tagging: { taggable: true, tagProperty: '/properties/Tags' },
    });
  import_(tagged({ Key: { type: 'string' }, Value: { type: 'string' } }));

  expect(
    missingInputFields(
      db,
      tagged({ Key: { type: 'string' }, Value: { type: 'string' }, Propagate: { type: 'boolean' } }),
    ),
  ).toEqual([]);
});

test('a renamed struct that the L1 follows is not missing any field', () => {
  ResourceSpecImporter.importTypes({
    db,
    specification: {
      ResourceSpecificationVersion: '0',
      ResourceTypes: { [RESOURCE]: { Properties: { Settings: { Type: 'SettingsRequest', UpdateType: 'Mutable' } } } },
      PropertyTypes: {
        [`${RESOURCE}.SettingsRequest`]: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
      },
    },
  });
  import_(renamed);

  expect(missingInputFields(db, renamed)).toEqual([]);
});

test('an L1 property of type json accepts every field', () => {
  ResourceSpecImporter.importTypes({
    db,
    specification: {
      ResourceSpecificationVersion: '0',
      ResourceTypes: { [RESOURCE]: { Properties: { Settings: { PrimitiveType: 'Json', UpdateType: 'Mutable' } } } },
      PropertyTypes: {},
    },
  });
  import_(renamed);

  expect(db.lookup('resource', 'cloudFormationType', 'equals', RESOURCE).only().properties.Settings.type).toEqual(
    expect.objectContaining({ type: 'ref' }),
  );
  expect(missingInputFields(db, renamed)).toEqual([]);
});

test('a resource that the L1 does not have misses every input property', () => {
  expect(missingInputFields(db, notRenamed)).toEqual(['Destinations', 'Settings']);
});

test('the schemas of every region in a directory are checked, and each missing field lists its regions', async () => {
  import_(renamed, 'us-east-1');
  import_(notRenamed, 'us-west-2');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfn-schemas-'));
  try {
    for (const [region, schema] of [
      ['us-east-1', renamed],
      ['us-east-2', renamed],
      ['us-west-2', notRenamed],
    ] as const) {
      fs.mkdirSync(path.join(dir, region));
      fs.writeFileSync(path.join(dir, region, 'aws-some-type.json'), JSON.stringify(schema));
    }

    const missing = await findMissingInputFields(db, dir);

    expect(missing).toEqual([
      { resource: RESOURCE, path: 'Destinations/*/Ip', regions: ['us-east-1', 'us-east-2'] },
      { resource: RESOURCE, path: 'Destinations/*/Network', regions: ['us-east-1', 'us-east-2'] },
      { resource: RESOURCE, path: 'Settings/Port', regions: ['us-east-1', 'us-east-2'] },
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the check fails instead of finding nothing when no CloudFormation schema loads', async () => {
  import_(renamed);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfn-schemas-'));
  try {
    await expect(findMissingInputFields(db, path.join(dir, 'absent'))).rejects.toThrow(/No CloudFormation schema/);

    await expect(findMissingInputFields(db, dir)).rejects.toThrow(/No CloudFormation schema/);

    // Like the README next to the region directories of the real sources
    fs.writeFileSync(path.join(dir, 'README.md'), '# Schemas');
    fs.mkdirSync(path.join(dir, 'us-east-1'));
    await expect(findMissingInputFields(db, dir)).rejects.toThrow(/No CloudFormation schema/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the report lists the missing fields by resource with the regions whose schema has them', () => {
  expect(
    formatMissingInputFields([
      { resource: RESOURCE, path: 'Settings/Port', regions: ['us-east-1', 'us-east-2'] },
      { resource: RESOURCE, path: 'Destinations/*/Network', regions: ['us-east-1'] },
    ]),
  ).toEqual(
    [
      'L1 input fields: FAIL (2 fields that CloudFormation accepts as input are missing from the L1)',
      '',
      `  ${RESOURCE}`,
      '    Destinations/*/Network (us-east-1)',
      '    Settings/Port (us-east-1, us-east-2)',
    ].join('\n'),
  );
  expect(formatMissingInputFields([])).toEqual(
    'L1 input fields: OK (the L1 has every field that CloudFormation accepts as input)',
  );
});

function import_(resource: CloudFormationRegistryResource, region?: string) {
  importCloudFormationRegistryResource({ db, report: new ProblemReport(), resource, region });
}

function registryResource(schema: Partial<CloudFormationRegistryResource>): CloudFormationRegistryResource {
  return {
    typeName: RESOURCE,
    description: 'Test resource',
    properties: {},
    ...schema,
  } as CloudFormationRegistryResource;
}

function object(properties: jsonschema.ObjectProperties): jsonschema.RecordLikeObject {
  return { type: 'object', properties, additionalProperties: false };
}
