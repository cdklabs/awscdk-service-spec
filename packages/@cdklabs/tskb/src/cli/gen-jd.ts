import * as fs from 'fs';
import * as path from 'path';

async function walk(dir: string) {
  const entries = []
  for await (const ent of await fs.promises.opendir(dir)) {
    entries.push(ent);
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  if (dir.endsWith('.jd')) {
    console.log(dir);
    const lines = [];

    for (const e of entries) {
      let identifier = path.parse(e.name).name.replace(/[^a-zA-Z0-9_]+/g, '_');
      if (!identifier.match(/^[a-zA-Z_]/)) identifier = `_${identifier}`;

      if (e.name.endsWith('.json')) {
        lines.push(`import * as ${identifier} from './${e.name}';`);
        lines.push(`export { ${identifier} };`);
      } else if (e.name.endsWith('.jd')) {
        lines.push(`export * as ${identifier} from './${e.name}';`);
      }
    }

    await fs.promises.writeFile(path.join(dir, 'index.ts'), lines.join('\n'), { encoding: 'utf-8' });
  }

  for (const d of entries) {
    const entry = path.join(dir, d.name);
    if (d.isDirectory()) walk(entry);
  }
}

// Then, use it with a simple async for loop
async function main() {
  walk('.');
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});