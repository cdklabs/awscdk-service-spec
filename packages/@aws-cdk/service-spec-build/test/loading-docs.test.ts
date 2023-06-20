import { emptyDatabase, Resource } from '@aws-cdk/service-spec-types';
import { importCloudFormationDocumentation } from '../src/import-cloudformation-docs';

let db: ReturnType<typeof emptyDatabase>;
let resource: Resource;
beforeEach(() => {
  db = emptyDatabase();

  // Put a resource in the database
  resource = db.allocate('resource', {
    cloudFormationType: 'AWS::Some::Type',
    attributes: {
      MyAttr: { type: { type: 'string' } },
    },
    name: 'Type',
    properties: {
      MyProp: { type: { type: 'string' } },
    },
  });
});

test('add documentation to resources in database', () => {
  // WHEN
  importCloudFormationDocumentation(db, {
    Types: {
      'AWS::Some::Type': {
        description: 'This is a fancy type',
        attributes: {
          MyAttr: 'Cool attr',
          Other: 'Not a cool attr',
        },
        properties: {
          MyProp: 'Cool prop',
          OtherProp: 'Not a cool prop',
        },
      },
    },
  });

  // THEN
  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(res?.documentation).toEqual('This is a fancy type');
  expect(res?.properties?.MyProp?.documentation).toEqual('Cool prop');
  expect(res?.attributes?.MyAttr?.documentation).toEqual('Cool attr');
});

test('add documentation to property types in database', () => {
  // GIVEN
  const typeDef = db.allocate('typeDefinition', {
    name: 'MyType',
    properties: {
      SomeProp: { type: { type: 'string' } },
    },
  });
  db.link('usesType', resource, typeDef);

  // WHEN
  importCloudFormationDocumentation(db, {
    Types: {
      'AWS::Some::Type.MyType': {
        description: 'This is a fancy type',
        properties: {
          SomeProp: 'Cool prop',
          OtherProp: 'Not a cool prop',
        },
      },
    },
  });

  // THEN
  const typ = db.all('typeDefinition')[0];
  expect(typ?.documentation).toEqual('This is a fancy type');
  expect(typ?.properties?.SomeProp?.documentation).toEqual('Cool prop');
});
