import { promises as fs } from 'fs';
import { formatPatchReport } from '@aws-cdk/service-spec-sources';
import { errorMessage } from '@cdklabs/tskb';
import { buildDatabase } from '../index';

async function main() {
  console.log('Building...');
  const { db, warnings, patchesApplied } = await buildDatabase({
    // FIXME: Switch this to 'true' at some point
    mustValidate: false,
  });

  console.log('Saving db.json');
  await fs.writeFile('db.json', JSON.stringify(db.save(), undefined, 1), { encoding: 'utf-8' });

  const report = new Array<string>();

  if (warnings.length > 0) {
    report.push(`    *** VALIDATION ERRORS (${warnings.length}) ***`);
    report.push('');
    for (const fail of warnings) {
      report.push(errorMessage(fail));
      console.error(errorMessage(fail));
    }
    report.push('');
  }

  if (patchesApplied.length > 0) {
    report.push(`    *** RESOURCES PATCHED (${patchesApplied.length}) ***`);
    report.push('');
    for (const patch of patchesApplied) {
      report.push(formatPatchReport(patch));
    }
  }

  const reportFile = 'db-build-report.txt';
  await fs.writeFile(reportFile, report.join('\n'), { encoding: 'utf-8' });

  console.error(`${patchesApplied.length} patches applied`);
  console.error(`${warnings.length} data errors`);
  console.error(`(see ${reportFile})`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
