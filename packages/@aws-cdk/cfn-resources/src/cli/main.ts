import path from 'path';
import { TypeScriptRenderer } from '@cdklabs/typewriter';
import * as fs from 'fs-extra';
import { AstBuilder } from './ast';
import { loadDatabase } from './db';

function debug(...messages: string[]) {
  if (process.env.DEBUG) {
    console.debug(...messages);
  }
}

async function main() {
  const db = await loadDatabase();
  const renderer = new TypeScriptRenderer();

  db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::S3::Bucket')[0].validations;

  const services = db.all('resource').map((r) => {
    debug(r.cloudFormationType, 'ast');
    const ast = AstBuilder.forResource(r.cloudFormationType, db);
    ast.addResource(r);
    return ast.scope;
  });

  console.log('Generating %i Resources for %i Services', db.all('resource').length, services.length);

  const outputPath = path.join(__dirname, '../services/');
  fs.removeSync(outputPath);
  for (const service of services) {
    debug(service.service.toUpperCase(), 'render');
    const filePath = path.join(outputPath, `${service.service.toLowerCase()}.ts`);
    fs.outputFileSync(filePath, renderer.render(service));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
