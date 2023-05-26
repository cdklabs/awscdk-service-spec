import { emptyDatabase } from '@aws-cdk/service-spec';
import * as sources from '@aws-cdk/service-spec-sources';
import { LoadResult, ProblemReport } from '@aws-cdk/service-spec-sources';
import { assertSuccess, Result } from '@cdklabs/tskb';
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
  const report = new ProblemReport();

  const resourceSpec = loadResult(await sources.loadDefaultResourceSpecification());

  for (const regions of await sources.loadDefaultCloudFormationRegistryResources(report, options.mustValidate)) {
    const region = db.allocate('region', {
      name: regions.regionName,
    });

    for (const resource of regions.resources) {
      const res = importCloudFormationRegistryResource({
        db,
        resource,
        report,
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

  const samSchema = loadResult(await sources.loadSamSchema());
  new SamResources({ db, samSchema, report }).import();

  const docs = await sources.loadDefaultCloudFormationDocs(report);
  importCloudFormationDocumentation(db, docs);

  const stateful = loadResult(await sources.loadDefaultStatefulResources());
  importStatefulResources(db, stateful);

  const cloudWatchServiceDirectory = loadResult(await sources.loadDefaultCloudWatchConsoleServiceDirectory());
  importCannedMetrics(db, cloudWatchServiceDirectory, report);

  new Scrutinies(db).import();
  new Augmentations(db).import();

  return { db, report };

  function loadResult<A>(x: Result<LoadResult<A>>): A {
    assertSuccess(x);

    // We might need to handle these issues earlier so that we can push them to appropriate teams
    report.reportFailure(sources.ReportAudience.cdkTeam(), 'loading', ...x.warnings);
    report.reportPatch(sources.ReportAudience.cdkTeam(), ...x.patchesApplied);

    return x.value;
  }
}
