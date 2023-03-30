import { emptyDatabase } from '@aws-cdk/service-spec';
import * as sources from '@aws-cdk/service-spec-sources';
import { LoadResult, PatchReport } from '@aws-cdk/service-spec-sources';
import { assertSuccess, Failures, Result } from '@cdklabs/tskb';
import { Augmentations } from './augmentations';
import { readCannedMetrics } from './canned-metrics';
import { readCloudFormationDocumentation } from './cloudformation-docs';
import {
  readCloudFormationRegistryResource,
  readCloudFormationRegistryServiceFromResource,
} from './cloudformation-registry';
import { Scrutinies } from './scrutinies';
import { readStatefulResources } from './stateful-resources';

export interface BuildDatabaseOptions {
  readonly mustValidate?: boolean;
}

export async function buildDatabase(options: BuildDatabaseOptions = {}) {
  const db = emptyDatabase();
  const warnings: Failures = [];
  const patchesApplied: PatchReport[] = [];

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

      const service = readCloudFormationRegistryServiceFromResource({
        db,
        resource,
      });
      db.link('regionHasService', region, service);
      db.link('hasResource', service, res);
    }
  }

  const docs = loadResult(await sources.loadDefaultCloudFormationDocs());
  readCloudFormationDocumentation(db, docs, warnings);

  const stateful = loadResult(await sources.loadDefaultStatefulResources());
  readStatefulResources(db, stateful, warnings);

  const cloudWatchServiceDirectory = loadResult(await sources.loadDefaultCloudWatchConsoleServiceDirectory());
  readCannedMetrics(db, cloudWatchServiceDirectory, warnings);

  new Scrutinies(db).annotate();
  new Augmentations(db).insert();

  return { db, warnings, patchesApplied };

  function loadResult<A>(x: Result<LoadResult<A>>): A {
    assertSuccess(x);
    warnings.push(...x.warnings);
    patchesApplied.push(...x.patchesApplied);
    return x.value;
  }
}
