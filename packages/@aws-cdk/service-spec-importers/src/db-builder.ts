import { promises as fs } from 'fs';
import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';
import { assertSuccess, Result } from '@cdklabs/tskb';
import { importArnTemplates } from './importers/import-arn-templates';
import { importCannedMetrics } from './importers/import-canned-metrics';
import { importCfnPrimaryIdentifierOverrides } from './importers/import-cfn-primaryidentifier-overrides';
import { importCloudFormationDocumentation } from './importers/import-cloudformation-docs';
import { importCloudFormationRegistryResource } from './importers/import-cloudformation-registry';
import { importEventBridgeSchema } from './importers/import-eventbridge-schema';
import { importGetAttAllowList } from './importers/import-getatt-allowlist';
import { importLogSources } from './importers/import-log-source';
import { importOobRelationships } from './importers/import-oob-relationships';
import { ResourceSpecImporter, SAMSpecImporter } from './importers/import-resource-spec';
import { SamResources } from './importers/import-sam';
import { importStatefulResources } from './importers/import-stateful-resources';
import { importTypeHistory, TypeHistoryResult } from './importers/import-type-history';
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
  loadCfnPrimaryIdentifierOverrides,
} from './loaders';
import { loadDefaultEventBridgeSchema } from './loaders/load-eventbridge-schema';
import { JsonLensPatcher } from './patching';
import { loadReleasedDatabase, ReleasedDatabase } from './released-database';
import { ProblemReport, ReportAudience } from './report';
import { loadTypeMappings } from './type-mappings';
import { DimensionSetNames } from './types';

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

export interface TypeHistoryOptions {
  /** The released database snapshot (`db.json.gz`) whose L1 types the build keeps */
  readonly snapshot: string;
  /** The pin file with the sha256 the snapshot must have */
  readonly pins: string;
  /** The type mapping file */
  readonly mappings: string;
}

export interface TypeHistory {
  readonly result: TypeHistoryResult;
  readonly released: ReleasedDatabase;
}

export class DatabaseBuilder {
  /**
   * The default grouping for any non-specific import problems
   */
  public readonly defaultProblemGrouping = new ReportAudience('__ImportProblems');

  /**
   * Stack of importers
   */
  private readonly sourceImporters = new Array<SourceImporter>();

  private typeHistory?: TypeHistory;

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
    /** The result of `importTypeHistory`, if it is one of the importers */
    typeHistory?: TypeHistory;
  }> {
    const report = new ProblemReport();
    this.typeHistory = undefined;

    for (const sourceImporter of this.sourceImporters) {
      await sourceImporter(this.db, report);
    }

    return {
      db: this.db,
      report: report,
      typeHistory: this.typeHistory,
    };
  }

  /**
   * Keep the L1 types of a released database, as decided by the type mapping file
   *
   * Call this after the sources that define resources and types. The build fails if the snapshot does not have the
   * sha256 of its pin file, or if the mapping file has a malformed entry. Cases the matcher cannot decide are
   * returned by `build()`, for the type history gate.
   */
  public importTypeHistory(options: TypeHistoryOptions) {
    return this.addSourceImporter(async (db) => {
      const mappings = await loadTypeMappings(options.mappings);
      const released = await loadReleasedDatabase(options.snapshot, options.pins);
      this.typeHistory = { result: importTypeHistory(db, released.db, mappings), released };
    });
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
  public importCannedMetrics(directoryPath: string) {
    return this.addSourceImporter(async (db, report) => {
      const cloudWatchServiceDirectory = this.loadResult(
        await loadDefaultCloudWatchConsoleServiceDirectory(
          `${directoryPath}/CloudWatchConsoleServiceDirectory.json`,
          this.options,
        ),
        report,
      );
      const dimensionSetNames: DimensionSetNames = JSON.parse(
        await fs.readFile(`${directoryPath}/dimension-sets-names.json`, 'utf-8'),
      );
      importCannedMetrics(db, cloudWatchServiceDirectory, report, dimensionSetNames);
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

  /**
   * Import patches to primary identifiers
   */
  public importCfnPrimaryIdentifierOverrides(specFilePath: string) {
    return this.addSourceImporter(async (db, report) => {
      const cfnIdentifiers = this.loadResult(
        await loadCfnPrimaryIdentifierOverrides(specFilePath, this.options),
        report,
      );

      importCfnPrimaryIdentifierOverrides(db, cfnIdentifiers);
    });
  }

  public importArnTemplates(filePath: string, overridesFilePath: string) {
    return this.addSourceImporter(async (db, report) => {
      const arnFormatIndex = JSON.parse(await fs.readFile(filePath, { encoding: 'utf-8' }));
      const overrides = JSON.parse(await fs.readFile(overridesFilePath, { encoding: 'utf-8' }));
      importArnTemplates({ ...arnFormatIndex, ...overrides }, db, report);
    });
  }

  public importOobRelationships(filePath: string, patcher?: JsonLensPatcher) {
    return this.addSourceImporter(async (db, report) => {
      const data = this.loadResult(await loadOobRelationships(filePath, { ...this.options, patcher }), report);
      importOobRelationships(db, data, report);
    });
  }

  public importLogSources(filepath: string) {
    return this.addSourceImporter(async (db, report) => {
      const logSourceData = JSON.parse(await fs.readFile(filepath, { encoding: 'utf-8' }));
      importLogSources(db, logSourceData, report);
    });
  }

  public importEventBridgeSchema(schemaDirectory: string) {
    return this.addSourceImporter(async (db, report) => {
      const regions = await loadDefaultEventBridgeSchema(schemaDirectory, {
        ...this.options,
        report,
        failureAudience: this.defaultProblemGrouping,
      });
      for (const region of regions) {
        for (const event of region.events) {
          importEventBridgeSchema({
            db,
            event,
            report,
            region: region.regionName,
          });
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
