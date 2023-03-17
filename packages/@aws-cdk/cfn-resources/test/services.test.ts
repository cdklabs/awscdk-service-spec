import { DatabaseSchema } from '@aws-cdk/service-spec';
import { Database } from '@cdklabs/tskb';
import { TypeScriptRenderer } from '@cdklabs/typewriter';
import { AstBuilder } from '../src/cli/cdk/ast';
import { loadDatabase } from '../src/cli/db';

const renderer = new TypeScriptRenderer();
let db: Database<DatabaseSchema>;

beforeAll(async () => {
  db = await loadDatabase();
});

test.each(['alexa-ask', 'aws-chatbot', 'aws-scheduler', 'aws-sqs'])('%s', (serviceName) => {
  const service = db.lookup('service', 'name', 'equals', serviceName)[0];

  const ast = AstBuilder.forService(service, { db });

  expect(renderer.render(ast.scope)).toMatchSnapshot();
});
