import { emptyDatabase } from '@aws-cdk/service-spec';
import * as sources from '@aws-cdk/service-spec-sources';
import { LoadResult, PatchReport } from '@aws-cdk/service-spec-sources';
import { assertSuccess, Failures, Result } from '@cdklabs/tskb';
import { Augmentations } from './import-augmentations';
import { importCannedMetrics } from './import-canned-metrics';
import { importCloudFormationDocumentation } from './import-cloudformation-docs';
import {
  importCloudFormationRegistryResource,
  readCloudFormationRegistryServiceFromResource,
} from './import-cloudformation-registry';
import { SamResources } from './import-sam';
import { Scrutinies } from './import-scrutinies';
import { importStatefulResources } from './import-stateful-resources';

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
      const res = importCloudFormationRegistryResource({
        db,
        resource,
        fails: warnings,
        resourceSpec: {
          spec: resourceSpec.ResourceTypes[resource.typeName],
          types: Object.fromEntries(
            Object.entries(resourceSpec.PropertyTypes)
              .filter(([typeName]) => typeName.startsWith(resource.typeName))
              .map(([typeName, typeDef]) => [typeName.split('.').splice(1).join('.'), typeDef]),
          ),
        },
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

  const samSchema = loadResult(await sources.loadSamResourceSpec());
  new SamResources({ db, samSchema, fails: warnings }).import();

  const docs = loadResult(await sources.loadDefaultCloudFormationDocs());
  importCloudFormationDocumentation(db, docs, warnings);

  const stateful = loadResult(await sources.loadDefaultStatefulResources());
  importStatefulResources(db, stateful, warnings);

  const cloudWatchServiceDirectory = loadResult(await sources.loadDefaultCloudWatchConsoleServiceDirectory());
  importCannedMetrics(db, cloudWatchServiceDirectory, warnings);

  new Scrutinies(db).import();
  new Augmentations(db).import();

  return { db, warnings, patchesApplied };

  function loadResult<A>(x: Result<LoadResult<A>>): A {
    assertSuccess(x);
    warnings.push(...x.warnings);
    patchesApplied.push(...x.patchesApplied);
    return x.value;
  }
}
