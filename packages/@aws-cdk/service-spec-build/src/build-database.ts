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
import { importLegacyInformation } from './import-legacy-information';
import { ResourceSpecImporter, SAMSpecImporter } from './import-resource-spec';
import { SamResources } from './import-sam';
import { Scrutinies } from './import-scrutinies';
import { importStatefulResources } from './import-stateful-resources';

export interface BuildDatabaseOptions {
  readonly mustValidate?: boolean;
}

export class DatabaseBuilder {
  public static buildDatabase(options: BuildDatabaseOptions) {
    return new DatabaseBuilder(options).build();
  }

  public readonly db = emptyDatabase();
  public readonly report = new ProblemReport();
  private resourceSpec!: sources.CloudFormationResourceSpecification;

  constructor(private readonly options: BuildDatabaseOptions) {}

  public async build() {
    this.resourceSpec = this.loadResult(await sources.loadDefaultResourceSpecification(this.options.mustValidate));

    await this.importRegistryResources();

    await this.importOldTypesFromSpec();

    await this.importEnhancements();

    return {
      db: this.db,
      report: this.report,
    };
  }

  private async importRegistryResources() {
    for (const regions of await sources.loadDefaultCloudFormationRegistryResources(
      this.report,
      this.options.mustValidate,
    )) {
      const region = this.db.allocate('region', {
        name: regions.regionName,
      });

      for (const resource of regions.resources) {
        const res = importCloudFormationRegistryResource({
          db: this.db,
          resource,
          report: this.report,
          resourceSpec: {
            spec: this.resourceSpec.ResourceTypes[resource.typeName],
            types: Object.fromEntries(
              Object.entries(this.resourceSpec.PropertyTypes)
                .filter(([typeName]) => typeName.startsWith(resource.typeName))
                .map(([typeName, typeDef]) => [typeName.split('.').splice(1).join('.'), typeDef]),
            ),
          },
        });
        this.db.link('regionHasResource', region, res);

        const service = readCloudFormationRegistryServiceFromResource({
          db: this.db,
          resource,
        });
        this.db.link('regionHasService', region, service);
        this.db.link('hasResource', service, res);
      }
    }

    const samSchema = this.loadResult(await sources.loadSamSchema());
    new SamResources({ db: this.db, samSchema, report: this.report }).import();

    importLegacyInformation(this.db, this.resourceSpec, this.report);
  }

  private async importOldTypesFromSpec() {
    ResourceSpecImporter.importOldTypes({
      db: this.db,
      specification: this.resourceSpec,
    });

    const samSpec = this.loadResult(await sources.loadSamSpec(this.options.mustValidate));

    SAMSpecImporter.importOldTypes({
      db: this.db,
      specification: samSpec,
    });
  }

  private async importEnhancements() {
    const docs = await sources.loadDefaultCloudFormationDocs(this.report);
    importCloudFormationDocumentation(this.db, docs);

    const stateful = this.loadResult(await sources.loadDefaultStatefulResources());
    importStatefulResources(this.db, stateful);

    const cloudWatchServiceDirectory = this.loadResult(await sources.loadDefaultCloudWatchConsoleServiceDirectory());
    importCannedMetrics(this.db, cloudWatchServiceDirectory, this.report);

    new Scrutinies(this.db).import();
    new Augmentations(this.db).import();
  }

  private loadResult<A>(x: Result<LoadResult<A>>): A {
    assertSuccess(x);

    // We might need to handle these issues earlier so that we can push them to appropriate teams
    this.report.reportFailure(sources.ReportAudience.cdkTeam(), 'loading', ...x.warnings);
    this.report.reportPatch(sources.ReportAudience.cdkTeam(), ...x.patchesApplied);

    return x.value;
  }
}
