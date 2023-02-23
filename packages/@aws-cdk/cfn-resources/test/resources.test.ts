import { DatabaseSchema } from '@aws-cdk/service-spec';
import { Database } from '@cdklabs/tskb';
import { TypeScriptRenderer } from '@cdklabs/typewriter';
import { loadDatabase } from '../src/cli/db';
import { AstBuilder } from '../src/cli/ast';

const renderer = new TypeScriptRenderer();
let db: Database<DatabaseSchema>;

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
])('%s', (cloudFormationType) => {
  const resource = db.lookup('resource', 'cloudFormationType', 'equals', cloudFormationType)[0];

  const ast = AstBuilder.forResource(resource.cloudFormationType, db);
  ast.addResource(resource);

  expect(renderer.render(ast.scope)).toMatchSnapshot();
});
