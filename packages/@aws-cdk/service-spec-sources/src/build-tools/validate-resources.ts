// A build tool to validate that our type definitions cover all resources
//
// Not a lot of thought given to where this needs to live yet.
import { errorMessage } from '@cdklabs/tskb';
import { loadDefaultCloudFormationRegistryResources } from '../loading/load-cloudformation-registry';

async function main() {
  const regions = await loadDefaultCloudFormationRegistryResources();

  let errors = 0;
  for (const region of regions) {
    for (const fail of region.failures) {
      console.log(errorMessage(fail));

      errors += 1;
      process.exitCode = 1;
    }
  }

  if (errors > 0) {
    console.log(`${errors} schema files have errors`);
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});