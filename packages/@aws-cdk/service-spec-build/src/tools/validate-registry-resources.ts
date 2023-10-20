// A build tool to validate that our type definitions cover all resources
//
// Not a lot of thought given to where this needs to live yet.
import * as path from 'path';
import { loadDefaultCloudFormationRegistryResources } from '../loading';
import { formatPatchReport, PatchReport } from '../patching';
import { ProblemReport } from '../report';

async function main() {
  const report = new ProblemReport();
  await loadDefaultCloudFormationRegistryResources(report, false);

  if (report.patchesApplied.length > 0) {
    const patches = uniqueReports(report.patchesApplied);
    console.log(`${patches.length} patches applied to sources`);
    console.log('===========================================');
    console.log();

    for (const patch of patches) {
      console.log(formatPatchReport(patch) + '\n');
    }
  }

  if (report.counts.interpreting + report.counts.loading > 0) {
    console.log(`${report.counts.interpreting + report.counts.loading} problems remaining after patching`);
    console.log('===========================================');
    console.log();
    process.exitCode = 1;
  }
}

/**
 * We have the same schema files in multiple directories. Do not report redundant patch reports.
 */
function uniqueReports(reports: PatchReport[]) {
  const seen = new Set<string>();
  const ret = new Array<PatchReport>();
  for (const report of reports) {
    const key = `${path.basename(report.fileName)}|${report.reason}|${report.path}`;
    if (!seen.has(key)) {
      ret.push(report);
      seen.add(key);
    }
  }
  return ret;
}

main().catch((e) => {
  console.log(e);
  process.exitCode = 1;
});
