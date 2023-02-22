import path from 'path';
import { TypeScriptRenderer } from '@cdklabs/typewriter';
import * as fs from 'fs-extra';
import { loadDatabase } from './db';
import { moduleFromResource } from './service';

async function main() {
  const db = await loadDatabase();
  const renderer = new TypeScriptRenderer();

  const services = db.all('resource').map(moduleFromResource);

  console.log('Generating %i Resources for %i Services', db.all('resource').length, services.length);

  const outputPath = path.join(__dirname, '../services/');
  fs.removeSync(outputPath);
  for (const service of services) {
    const filePath = path.join(outputPath, `${service.service.toLowerCase()}.ts`);
    fs.outputFileSync(filePath, renderer.render(service));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
