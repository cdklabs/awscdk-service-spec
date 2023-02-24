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

  const resources = db.all('resource').map((r) => {
    debug(r.cloudFormationType, 'ast');
    const ast = AstBuilder.forResource(r.cloudFormationType, db);
    ast.addResource(r);
    return ast.scope;
  });

  console.log('Generating %i Resources for %i Services', db.all('resource').length, resources.length);

  const outputPath = path.join(__dirname, '../services/');
  fs.removeSync(outputPath);
  for (const res of resources) {
    debug(`${res.service}::${res.resource}`, 'render');
    const filePath = path.join(outputPath, `${res.service}-${res.resource}.ts`.toLowerCase());
    fs.outputFileSync(filePath, renderer.render(res));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
