// A build tool to validate that our type definitions cover all resources
//
// Not a lot of thought given to where this needs to live yet.
import * as path from 'path';
import { errorMessage } from '@cdklabs/tskb';
import { loadDefaultCloudFormationRegistryResources } from '../loading/load-cloudformation-registry';
import { formatPatchReport } from '../loading/patches/format-patch-report';
import { PatchReport } from '../loading/patches/patching';

async function main() {
  const allResources = await loadDefaultCloudFormationRegistryResources(false);

  if (allResources.patchesApplied.length > 0) {
    const patches = uniqueReports(allResources.patchesApplied);
    console.log(`${patches.length} patches applied to sources`);
    console.log('===========================================');
    console.log();

    for (const patch of patches) {
      console.log(formatPatchReport(patch) + '\n');
    }
  }

  if (allResources.warnings.length > 0) {
    console.log(`${allResources.warnings.length} schema files do not validate (after patching)`);
    console.log('===========================================');
    console.log();
    process.exitCode = 1;

    for (const fail of allResources.warnings) {
      console.log(errorMessage(fail));
    }
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
