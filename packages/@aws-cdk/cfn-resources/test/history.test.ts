import { SpecDatabase } from '@aws-cdk/service-spec';
import { IScope } from '@cdklabs/typewriter';
import { AstBuilder } from '../src/cli/cdk/ast';
import { loadDatabase } from '../src/cli/db';

let db: SpecDatabase;

beforeAll(async () => {
  db = await loadDatabase();
});

// In the old cfn2ts implementation we render all types into the spec
// To ensure backwards compatibility we will render previous types
test('Previous types are rendered', () => {
  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::CloudFormation::StackSet')[0];
  const ast = AstBuilder.forResource(resource, { db });
  const stackSet = ast.module?.tryFindType('@aws-cdk/cloudformation/stackset-l1.CfnStackSet') as unknown as IScope;

  expect(stackSet.tryFindType('@aws-cdk/cloudformation/stackset-l1.CfnStackSet.ManagedExecutionProperty')).toBeTruthy();
});
