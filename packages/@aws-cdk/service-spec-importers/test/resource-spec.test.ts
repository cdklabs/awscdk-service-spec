import { DefinitionReference, emptyDatabase } from '@aws-cdk/service-spec-types';
import { ResourceSpecImporter } from '../src/importers/import-resource-spec';

let db: ReturnType<typeof emptyDatabase>;
beforeEach(() => {
  db = emptyDatabase();
});

test('include legacy attributes in attributes', () => {
  ResourceSpecImporter.importTypes({
    db,
    specification: {
      ResourceSpecificationVersion: '0',
      ResourceTypes: {
        'AWS::Some::Type': {
          Attributes: {
            Property: { PrimitiveType: 'String' },
          },
        },
      },
      PropertyTypes: {},
    },
  });

  const attrNames = Object.keys(
    db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0]?.attributes,
  );
  expect(attrNames.sort()).toEqual(['Property']);
});

describe('with a type definition using time stamps', () => {
  beforeEach(() => {
    ResourceSpecImporter.importTypes({
      db,
      specification: {
        ResourceSpecificationVersion: '0',
        ResourceTypes: {
          'AWS::Some::Type': {
            Properties: {
              PropertyList: {
                Type: 'List',
                ItemType: 'Property',
                UpdateType: 'Mutable',
              },
              PropertySingular: {
                Type: 'Property',
                UpdateType: 'Mutable',
              },
              Id: {
                PrimitiveType: 'String',
                UpdateType: 'Mutable',
              },
            },
          },
        },
        PropertyTypes: {
          'AWS::Some::Type.Property': {
            Properties: {
              DateTime: {
                PrimitiveType: 'Timestamp',
                UpdateType: 'Mutable',
              },
            },
          },
        },
      },
    });
  });

  test('reference types are correctly named', () => {
    const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type').only();
    const types = db.follow('usesType', resource);

    expect(types.length).toBe(1);
    expect(types[0].entity.name).toBe('Property');
  });

  test('legacy timestamps are getting the timestamp format', () => {
    const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type').only();
    const prop = resource.properties?.PropertySingular;
    expect(prop.type.type).toBe('ref');

    const type = db.get('typeDefinition', (prop.type as DefinitionReference).reference.$ref);
    expect(type.properties.DateTime.type).toMatchObject({ type: 'date-time' });
  });
});

test('import immutability', () => {
  ResourceSpecImporter.importTypes({
    db,
    specification: {
      ResourceSpecificationVersion: '0',
      ResourceTypes: {
        'AWS::Some::Type': {
          Properties: {
            Prop1: { PrimitiveType: 'String', UpdateType: 'Conditional' },
            Prop2: { PrimitiveType: 'String', UpdateType: 'Immutable' },
          },
        },
      },
      PropertyTypes: {
        'AWS::Some::Type.Type1': {
          Properties: {
            Prop1: { PrimitiveType: 'String', UpdateType: 'Conditional' },
          },
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type').only();

  expect(resource.properties.Prop1.causesReplacement).toEqual('maybe');
  expect(resource.properties.Prop2.causesReplacement).toEqual('yes');

  const type = db.follow('usesType', resource).only().entity;
  expect(type.properties.Prop1.causesReplacement).toEqual('maybe');
});
