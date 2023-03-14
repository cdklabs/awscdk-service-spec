import path from 'path';
import { TypeScriptRenderer } from '@cdklabs/typewriter';
import * as fs from 'fs-extra';
import { AstBuilder } from './cdk/ast';
import { loadDatabase } from './db';

function debug(...messages: string[]) {
  if (process.env.DEBUG) {
    console.debug(...messages);
  }
}

async function main() {
  const db = await loadDatabase();
  const renderer = new TypeScriptRenderer();

  const services = db.all('service').map((s) => {
    debug(s.name, 'ast');
    const ast = AstBuilder.forService(s, db);
    return ast.scope;
  });

  console.log('Generating %i Resources for %i Services', db.all('resource').length, db.all('service').length);

  const outputPath = path.join(__dirname, '../services/');
  fs.removeSync(outputPath);
  for (const s of services) {
    debug(`${s.service}`, 'render');
    const filePath = path.join(outputPath, s.name, `${s.shortName}-generated.ts`).toLowerCase();
    fs.outputFileSync(filePath, renderer.render(s));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
