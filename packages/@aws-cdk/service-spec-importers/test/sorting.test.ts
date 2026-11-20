import { compareByCodeUnit } from '../src/report/sorting';

test.each([
  // Upper case before lower case, where a locale compares case last
  ['AWS::IVS::Channel', 'AWS::IoT::Thing'],
  ['ReplicaSpecification', 'Replicas'],
  // Lithuanian sorts y with i
  ['AWS::DMS::DataProvider', 'AWS::DynamoDB::GlobalTable'],
  // Slovak sorts ch after h
  ['ScheduleTrigger', 'ScriptLocation'],
])('%s sorts before %s in every locale', (first, second) => {
  expect([second, first].sort(compareByCodeUnit)).toEqual([first, second]);
  expect(compareByCodeUnit(first, first)).toBe(0);
});
