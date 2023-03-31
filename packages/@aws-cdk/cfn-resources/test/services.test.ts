import { SpecDatabase } from '@aws-cdk/service-spec';
import { TypeScriptRenderer } from '@cdklabs/typewriter';
import { AstBuilder } from '../src/cli/cdk/ast';
import { loadDatabase } from '../src/cli/db';

const renderer = new TypeScriptRenderer();
let db: SpecDatabase;

beforeAll(async () => {
  db = await loadDatabase();
});

test.each(['alexa-ask', 'aws-chatbot', 'aws-scheduler', 'aws-sqs', 'aws-sam'])('%s', (serviceName) => {
  const service = db.lookup('service', 'name', 'equals', serviceName)[0];

  const ast = AstBuilder.forService(service, { db });

  const rendered = {
    module: renderer.render(ast.module),
    augmentations: ast.augmentations?.hasAugmentations ? renderer.render(ast.augmentations) : undefined,
    metrics: ast.cannedMetrics?.hasCannedMetrics ? renderer.render(ast.cannedMetrics) : undefined,
  };

  expect(rendered).toMatchSnapshot();
});

test('can codegen service with arbitrary suffix', () => {
  const service = db.lookup('service', 'name', 'equals', 'aws-kinesisanalyticsv2').only();

  const ast = AstBuilder.forService(service, { db, nameSuffix: 'V2' });

  const rendered = renderer.render(ast.module);

  expect(rendered).toMatchSnapshot();
  expect(rendered).toContain('class CfnApplicationV2');
  expect(rendered).toContain('namespace CfnApplicationV2');
  expect(rendered).toContain('interface CfnApplicationV2Props');
  expect(rendered).toContain('function convertCfnApplicationV2PropsToCloudFormation');
  expect(rendered).toContain('function CfnApplicationV2ApplicationCodeConfigurationPropertyValidator');
});
