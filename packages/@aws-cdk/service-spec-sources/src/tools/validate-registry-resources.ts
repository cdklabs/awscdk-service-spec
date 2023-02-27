// A build tool to validate that our type definitions cover all resources
//
// Not a lot of thought given to where this needs to live yet.
import { errorMessage } from '@cdklabs/tskb';
import { loadDefaultCloudFormationRegistryResources } from '../loading/load-cloudformation-registry';
import { formatPatchReport } from '../loading/patches/format-patch-report';

async function main() {
  const allResources = await loadDefaultCloudFormationRegistryResources(false);

  if (allResources.patchesApplied.length > 0) {
    console.log(`${allResources.patchesApplied.length} patches applied to sources`);

    for (const patch of allResources.patchesApplied) {
      console.log(formatPatchReport(patch));
    }
  }

  if (allResources.warnings.length > 0) {
    console.log(`${allResources.warnings.length} schema files do not validate (after patching)`);
    process.exitCode = 1;

    for (const fail of allResources.warnings) {
      console.log(errorMessage(fail));
    }
  }
}

main().catch((e) => {
  console.log(e);
  process.exitCode = 1;
});
