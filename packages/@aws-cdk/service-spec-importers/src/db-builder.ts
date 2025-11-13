import { promises as fs } from 'fs';
import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';
import { assertSuccess, Result } from '@cdklabs/tskb';
import { importArnTemplates } from './importers/import-arn-templates';
import { importCannedMetrics } from './importers/import-canned-metrics';
import { importCloudFormationDocumentation } from './importers/import-cloudformation-docs';
import { importCloudFormationRegistryResource } from './importers/import-cloudformation-registry';
import { importEventBridgeSchema } from './importers/import-eventbridge-schema';
import { importGetAttAllowList } from './importers/import-getatt-allowlist';
import { importOobRelationships } from './importers/import-oob-relationships';
import { ResourceSpecImporter, SAMSpecImporter } from './importers/import-resource-spec';
import { SamResources } from './importers/import-sam';
import { importStatefulResources } from './importers/import-stateful-resources';
import {
  loadDefaultCloudFormationDocs,
  loadDefaultCloudFormationRegistryResources,
  loadDefaultCloudWatchConsoleServiceDirectory,
  loadDefaultResourceSpecification,
  loadDefaultStatefulResources,
  loadGetAttAllowList,
  LoadResult,
  loadSamSchema,
  loadSamSpec,
  loadOobRelationships,
} from './loaders';
import { loadDefaultEventBridgeSchema } from './loaders/load-eventbridge-schema';
import { JsonLensPatcher } from './patching';
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
  /**
   * The default grouping for any non-specific import problems
   */
  public readonly defaultProblemGrouping = new ReportAudience('__ImportProblems');

  /**
   * Stack of importers
   */
  private readonly sourceImporters = new Array<SourceImporter>();

  constructor(
    protected readonly db: SpecDatabase = emptyDatabase(),
    private readonly options: DatabaseBuilderOptions,
  ) {}

  /**
   * Add a SourceImporter to the database builder
   */
  public addSourceImporter(sourceImporter: SourceImporter): this {
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
  public importCloudFormationRegistryResources(schemaDirectory: string, patcher?: JsonLensPatcher) {
    return this.addSourceImporter(async (db, report) => {
      const regions = await loadDefaultCloudFormationRegistryResources(schemaDirectory, {
        ...this.options,
        report,
        failureAudience: this.defaultProblemGrouping,
        patcher,
      });
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
  public importSamJsonSchema(filePath: string, patcher?: JsonLensPatcher) {
    return this.addSourceImporter(async (db, report) => {
      const samSchema = this.loadResult(
        await loadSamSchema(filePath, {
          ...this.options,
          patcher,
        }),
        report,
      );
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
   * Import the GetAtt allowlist
   */
  public importGetAttAllowList(specFilePath: string) {
    return this.addSourceImporter(async (db, report) => {
      const allowListSpec = this.loadResult(await loadGetAttAllowList(specFilePath, this.options), report);

      importGetAttAllowList(db, allowListSpec);
    });
  }

  public importArnTemplates(filePath: string) {
    return this.addSourceImporter(async (db, report) => {
      const arnFormatIndex = JSON.parse(await fs.readFile(filePath, { encoding: 'utf-8' }));
      importArnTemplates(arnFormatIndex, db, report);
    });
  }

  public importOobRelationships(filePath: string) {
    return this.addSourceImporter(async (db, report) => {
      const data = this.loadResult(await loadOobRelationships(filePath, this.options), report);
      importOobRelationships(db, data, report);
    });
  }

  /**
   * Import the EvnetBridge schema
   */
  public importEventBridgeSchema(schemaDirectory: string) {
    return this.addSourceImporter(async (db, report) => {
      const regions = await loadDefaultEventBridgeSchema(schemaDirectory, {
        ...this.options,
        report,
        failureAudience: this.defaultProblemGrouping,
        // patcher,
      });
      for (const region of regions) {
        for (const event of region.events) {
          // console.log({ region, resource: JSON.stringify(event, null, 2), name: event.SchemaName });
          importEventBridgeSchema({
            db,
            event,
            report,
            region: region.regionName,
          });
          // const existing = db.lookup('event', 'name', 'equals', event.SchemaName.split('@')[1]);
          // console.log('db-builder', { existing });
        }
      }
    });
  }

  /**
   * Look at a load result and report problems
   */
  protected loadResult<A>(result: Result<LoadResult<A>>, report: ProblemReport): A {
    assertSuccess(result);

    report.reportFailure(this.defaultProblemGrouping, 'loading', ...result.warnings);
    report.reportPatch(this.defaultProblemGrouping, ...result.patchesApplied);

    return result.value;
  }
}
