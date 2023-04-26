import { SpecDatabase } from '@aws-cdk/service-spec';
import { TypeScriptRenderer } from '@cdklabs/typewriter';
import { AstBuilder } from '../src/cli/cdk/ast';
import { loadDatabase } from '../src/cli/db';

const renderer = new TypeScriptRenderer();
let db: SpecDatabase;

beforeAll(async () => {
  db = await loadDatabase();
});

test.each([
  'Alexa::ASK::Skill',
  'AWS::ApiGateway::RestApi',
  'AWS::IAM::Role',
  'AWS::Lambda::Function',
  'AWS::S3::Bucket',
  'AWS::SQS::Queue',
  'AWS::RDS::DBCluster',
])('%s', (cloudFormationType) => {
  const resource = db.lookup('resource', 'cloudFormationType', 'equals', cloudFormationType)[0];

  const ast = AstBuilder.forResource(resource, { db });

  const rendered = {
    module: renderer.render(ast.module),
    augmentations: ast.augmentations?.hasAugmentations ? renderer.render(ast.augmentations) : undefined,
    metrics: ast.cannedMetrics?.hasCannedMetrics ? renderer.render(ast.cannedMetrics) : undefined,
  };

  expect(rendered).toMatchSnapshot();
});
