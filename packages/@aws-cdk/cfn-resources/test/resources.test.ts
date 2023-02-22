import { DatabaseSchema } from '@aws-cdk/service-spec';
import { Database } from '@cdklabs/tskb';
import { TypeScriptRenderer } from '@cdklabs/typewriter';
import { loadDatabase } from '../src/cli/db';
import { moduleFromResource } from '../src/cli/service';

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
  const mod = moduleFromResource(resource);
  expect(renderer.render(mod)).toMatchSnapshot();
});
