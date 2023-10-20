import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { importStatefulResources } from '../src/importers/import-stateful-resources';

let db: ReturnType<typeof emptyDatabase>;
beforeEach(() => {
  db = emptyDatabase();

  // Put a resource in the database
  db.allocate('resource', {
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

test('mark resource types as stateful', () => {
  // WHEN
  importStatefulResources(db, {
    ResourceTypes: {
      'AWS::Some::Type': {},
    },
  });

  // THEN
  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(res?.isStateful).toEqual(true);
});
