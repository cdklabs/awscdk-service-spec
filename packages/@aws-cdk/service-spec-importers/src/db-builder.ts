import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';
import { assertSuccess, Result } from '@cdklabs/tskb';
import { Augmentations } from './importers/import-augmentations';
import { importCannedMetrics } from './importers/import-canned-metrics';
import { importCloudFormationDocumentation } from './importers/import-cloudformation-docs';
import { importCloudFormationRegistryResource } from './importers/import-cloudformation-registry';
import { ResourceSpecImporter, SAMSpecImporter } from './importers/import-resource-spec';
import { SamResources } from './importers/import-sam';
import { Scrutinies } from './importers/import-scrutinies';
import { importStatefulResources } from './importers/import-stateful-resources';
import {
  loadDefaultCloudFormationDocs,
  loadDefaultCloudFormationRegistryResources,
  loadDefaultCloudWatchConsoleServiceDirectory,
  loadDefaultResourceSpecification,
  loadDefaultStatefulResources,
  LoadResult,
  loadSamSchema,
  loadSamSpec,
} from './loaders';
import { ProblemReport, ReportAudience } from './report';

export interface DatabaseBuilderOptions {
  /**
   * Fail if we detect schema validations with the data source
   * @default true
   */
  readonly validate?: boolean;

  /**
   * Print additional debug information
   * @default false
   */
  readonly debug?: boolean;
}

export type SourceImporter = (db: SpecDatabase, report: ProblemReport) => Promise<void>;

export class DatabaseBuilder {
  private readonly sourceImporters = new Array<SourceImporter>();

  constructor(
    protected readonly db: SpecDatabase = emptyDatabase(),
    private readonly options: DatabaseBuilderOptions,
  ) {}

  /**
   * Add a SourceImporter to the database builder
   */
  public addSourceImporter(sourceImporter: SourceImporter): DatabaseBuilder {
    this.sourceImporters.push(sourceImporter);
    return this;
  }

  /**
   * Apply all source importers
   */
  public async build(): Promise<{
    db: SpecDatabase;
    report: ProblemReport;
  }> {
    const report = new ProblemReport();

    for (const sourceImporter of this.sourceImporters) {
      await sourceImporter(this.db, report);
    }

    return {
      db: this.db,
      report: report,
    };
  }

  /**
   * Import the (legacy) resource spec
   */
  public importCloudFormationResourceSpec(specDirectory: string) {
    return this.addSourceImporter(async (db, report) => {
      const resourceSpec = this.loadResult(await loadDefaultResourceSpecification(specDirectory, this.options), report);

      ResourceSpecImporter.importTypes({
        db,
        specification: resourceSpec,
      });
    });
  }

  /**
   * Import the (legacy) resource spec for SAM, from GoFormation
   */
  public importSamResourceSpec(specDirectory: string) {
    return this.addSourceImporter(async (db, report) => {
      const samSpec = this.loadResult(await loadSamSpec(specDirectory, this.options), report);
      SAMSpecImporter.importTypes({
        db,
        specification: samSpec,
      });
    });
  }

  /**
   * Import the (modern) registry spec from CloudFormation
   */
  public importCloudFormationRegistryResources(schemaDirectory: string) {
    return this.addSourceImporter(async (db, report) => {
      const regions = await loadDefaultCloudFormationRegistryResources(schemaDirectory, report, this.options);
      for (const region of regions) {
        for (const resource of region.resources) {
          importCloudFormationRegistryResource({
            db,
            resource,
            report,
            region: region.regionName,
          });
        }
      }
    });
  }

  /**
   * Import the (modern) JSON schema spec from SAM
   */
  public importSamJsonSchema(filePath: string) {
    return this.addSourceImporter(async (db, report) => {
      const samSchema = this.loadResult(await loadSamSchema(filePath, this.options), report);
      new SamResources({ db, samSchema, report }).import();
    });
  }

  /**
   * Import the CloudFormation Documentation
   */
  public importCloudFormationDocs(filePath: string) {
    return this.addSourceImporter(async (db, report) => {
      const docs = this.loadResult(await loadDefaultCloudFormationDocs(filePath, this.options), report);
      importCloudFormationDocumentation(db, docs);
    });
  }

  /**
   * Import stateful resource information
   */
  public importStatefulResources(filePath: string) {
    return this.addSourceImporter(async (db, report) => {
      const stateful = this.loadResult(await loadDefaultStatefulResources(filePath, this.options), report);
      importStatefulResources(db, stateful);
    });
  }

  /**
   * Import canned metrics from the CloudWatch Console Service Directory
   */
  public importCannedMetrics(filePath: string) {
    return this.addSourceImporter(async (db, report) => {
      const cloudWatchServiceDirectory = this.loadResult(
        await loadDefaultCloudWatchConsoleServiceDirectory(filePath, this.options),
        report,
      );
      importCannedMetrics(db, cloudWatchServiceDirectory, report);
    });
  }

  /**
   * Import Augmentations
   */
  public importAugmentations() {
    return this.addSourceImporter(async (db) => new Augmentations(db).import());
  }

  /**
   * Import Scrutinies
   */
  public importScrutinies() {
    return this.addSourceImporter(async (db) => new Scrutinies(db).import());
  }

  /**
   * Look at a load result and report problems
   */
  private loadResult<A>(result: Result<LoadResult<A>>, report: ProblemReport): A {
    assertSuccess(result);

    report.reportFailure(ReportAudience.cdkTeam(), 'loading', ...result.warnings);
    report.reportPatch(ReportAudience.cdkTeam(), ...result.patchesApplied);

    return result.value;
  }
}
