import { emptyDatabase } from '@aws-cdk/service-spec';
import { Failures } from '@cdklabs/tskb';
import { readStatefulResources } from '../src/stateful-resources';

let db: ReturnType<typeof emptyDatabase>;
let fails: Failures;
beforeEach(() => {
  db = emptyDatabase();
  fails = [];

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
  readStatefulResources(
    db,
    {
      ResourceTypes: {
        'AWS::Some::Type': {},
      },
    },
    fails,
  );

  // THEN
  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(res?.isStateful).toEqual(true);
});
