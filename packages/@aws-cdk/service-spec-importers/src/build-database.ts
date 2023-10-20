import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { assertSuccess, Result } from '@cdklabs/tskb';
import { Augmentations } from './import-augmentations';
import { importCannedMetrics } from './import-canned-metrics';
import { importCloudFormationDocumentation } from './import-cloudformation-docs';
import { importCloudFormationRegistryResource } from './import-cloudformation-registry';
import { ResourceSpecImporter, SAMSpecImporter } from './import-resource-spec';
import { SamResources } from './import-sam';
import { Scrutinies } from './import-scrutinies';
import { importStatefulResources } from './import-stateful-resources';
import {
  loadDefaultCloudFormationDocs,
  loadDefaultCloudFormationRegistryResources,
  loadDefaultCloudWatchConsoleServiceDirectory,
  loadDefaultResourceSpecification,
  loadDefaultStatefulResources,
  LoadResult,
  loadSamSchema,
  loadSamSpec,
} from './loading';
import { ProblemReport, ReportAudience } from './report';

export interface BuildDatabaseOptions {
  readonly mustValidate?: boolean;
}

export class DatabaseBuilder {
  public static buildDatabase(options: BuildDatabaseOptions) {
    return new DatabaseBuilder(options).build();
  }

  public readonly db = emptyDatabase();
  public readonly report = new ProblemReport();

  constructor(private readonly options: BuildDatabaseOptions) {}

  public async build() {
    await this.importCloudFormationResourceSpec();
    await this.importSamResourceSpec();
    await this.importCloudFormationRegistryResources();
    await this.importSamJsonSchema();
    await this.importEnhancements();

    return {
      db: this.db,
      report: this.report,
    };
  }

  /**
   * Import the (legacy) resource spec
   */
  private async importCloudFormationResourceSpec() {
    const resourceSpec = this.loadResult(await loadDefaultResourceSpecification(this.options.mustValidate));

    ResourceSpecImporter.importTypes({
      db: this.db,
      specification: resourceSpec,
    });
  }

  /**
   * Import the (legacy) resource spec for SAM, from GoFormation
   */
  private async importSamResourceSpec() {
    const samSpec = this.loadResult(await loadSamSpec(this.options.mustValidate));
    SAMSpecImporter.importTypes({
      db: this.db,
      specification: samSpec,
    });
  }

  /**
   * Import the (modern) registry spec from CloudFormation
   */
  private async importCloudFormationRegistryResources() {
    const regions = await loadDefaultCloudFormationRegistryResources(this.report, this.options.mustValidate);
    for (const region of regions) {
      for (const resource of region.resources) {
        importCloudFormationRegistryResource({
          db: this.db,
          resource,
          report: this.report,
          region: region.regionName,
        });
      }
    }
  }

  /**
   * Import the (modern) JSON schema spec from SAM
   */
  private async importSamJsonSchema() {
    const samSchema = this.loadResult(await loadSamSchema());
    new SamResources({ db: this.db, samSchema, report: this.report }).import();
  }

  /**
   * Import various additions on top of the base specs
   */
  private async importEnhancements() {
    const docs = await loadDefaultCloudFormationDocs(this.report);
    importCloudFormationDocumentation(this.db, docs);

    const stateful = this.loadResult(await loadDefaultStatefulResources());
    importStatefulResources(this.db, stateful);

    const cloudWatchServiceDirectory = this.loadResult(await loadDefaultCloudWatchConsoleServiceDirectory());
    importCannedMetrics(this.db, cloudWatchServiceDirectory, this.report);

    new Scrutinies(this.db).import();
    new Augmentations(this.db).import();
  }

  private loadResult<A>(x: Result<LoadResult<A>>): A {
    assertSuccess(x);

    // We might need to handle these issues earlier so that we can push them to appropriate teams
    this.report.reportFailure(ReportAudience.cdkTeam(), 'loading', ...x.warnings);
    this.report.reportPatch(ReportAudience.cdkTeam(), ...x.patchesApplied);

    return x.value;
  }
}
