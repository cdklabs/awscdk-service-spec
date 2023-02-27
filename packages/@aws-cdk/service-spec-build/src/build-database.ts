import { emptyDatabase } from '@aws-cdk/service-spec';
import * as sources from '@aws-cdk/service-spec-sources';
import { LoadResult } from '@aws-cdk/service-spec-sources';
import { assertSuccess, Failures, Result } from '@cdklabs/tskb';
import { readCloudFormationDocumentation } from './cloudformation-docs';
import { readCloudFormationRegistryResource } from './cloudformation-registry';
import { readStatefulResources } from './stateful-resources';

export interface BuildDatabaseOptions {
  readonly mustValidate?: boolean;
}

export async function buildDatabase(options: BuildDatabaseOptions = {}) {
  const db = emptyDatabase();
  const warnings: Failures = [];

  const resourceSpec = loadResult(await sources.loadDefaultResourceSpecification());

  for (const resources of loadResult(await sources.loadDefaultCloudFormationRegistryResources(options.mustValidate))) {
    const region = db.allocate('region', {
      name: resources.regionName,
    });

    for (const resource of resources.resources) {
      const res = readCloudFormationRegistryResource({
        db,
        resource,
        fails: warnings,
        specResource: resourceSpec.ResourceTypes[resource.typeName],
      });
      db.link('regionHasResource', region, res);
    }
  }

  const docs = loadResult(await sources.loadDefaultCloudFormationDocs());
  readCloudFormationDocumentation(db, docs, warnings);

  const stateful = loadResult(await sources.loadDefaultStatefulResources());
  readStatefulResources(db, stateful, warnings);

  return { db, warnings };

  function loadResult<A>(x: Result<LoadResult<A>>): A {
    assertSuccess(x);
    warnings.push(...x.warnings);
    return x.value;
  }
}
