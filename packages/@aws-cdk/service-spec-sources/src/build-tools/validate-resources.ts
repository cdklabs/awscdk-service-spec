// A build tool to validate that our type definitions cover all resources
//
// Not a lot of thought given to where this needs to live yet.
import { errorMessage } from '@cdklabs/tskb';
import { loadDefaultCloudFormationRegistryResources } from '../loading/load-cloudformation-registry';

async function main() {
  const allResources = await loadDefaultCloudFormationRegistryResources();

  if (allResources.warnings.length > 0) {
    console.log(`${allResources.warnings.length} schema files have errors`);
  }

  for (const fail of allResources.warnings) {
    console.log(errorMessage(fail));

    process.exitCode = 1;
  }

  if (allResources.warnings.length > 0) {
    console.log(`${allResources.warnings.length} schema files have errors`);
  }
}

main().catch((e) => {
  console.log(e);
  process.exitCode = 1;
});
