import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { importGetAttAllowList } from '../src/importers/import-getatt-allowlist';

let db: ReturnType<typeof emptyDatabase>;
beforeEach(() => {
  db = emptyDatabase();

  // Put a resource in the database
  db.allocate('resource', {
    cloudFormationType: 'AWS::Some::Type',
    attributes: {},
    name: 'Type',
    properties: {
      MyProp: { type: { type: 'string' } },
    },
  });
});

test('mark resource types as stateful', () => {
  // WHEN
  importGetAttAllowList(db, {
    'AWS::Some::Type': ['MyProp'],
  });

  // THEN
  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(res?.attributes.MyProp).toBeDefined();
});
