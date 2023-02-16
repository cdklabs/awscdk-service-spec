import { emptyDatabase, Region } from '@aws-cdk/service-spec';
import { Failures } from '@cdklabs/tskb';
import { loadCloudFormationRegistryResource } from '../src/cloudformation-registry';

let db: ReturnType<typeof emptyDatabase>;
let region: Region;
let fails: Failures;
beforeEach(() => {
  db = emptyDatabase();
  region = db.allocate('region', { name: 'us-somewhere' });
  fails = [];
});

test('exclude readOnlyProperties from properties', () => {
  loadCloudFormationRegistryResource(db, region, {
    description: 'Test resource',
    typeName: 'AWS::Some::Type',
    properties: {
      Property: { type: 'string' },
      Id: { type: 'string' },
    },
    readOnlyProperties: ['/properties/Id'],
  }, fails);

  const propNames = Object.keys(db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0]?.properties);
  expect(propNames).toEqual(['Property']);
});