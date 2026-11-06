import * as path from 'node:path';
import { DatabaseBuilder, DatabaseBuilderOptions, ReportAudience } from '@aws-cdk/service-spec-importers';
import { patchOobRelationships } from '@aws-cdk/service-spec-importers/src/patches/oob-relationship-patches';
import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { Augmentations } from './augmentations';
import { patchCloudFormationRegistry } from './patches/registry-patches';
import { patchSamTemplateSpec } from './patches/sam-patches';
import { Scrutinies } from './scrutinies';

const SOURCES = path.join(__dirname, '../../../../sources');

/**
 * The released database whose L1 types every build keeps, and its pin file
 */
export const RELEASED_DATABASE = {
  snapshot: path.join(SOURCES, 'ReleasedDatabase/db.json.gz'),
  pins: path.join(__dirname, 'released-database.json'),
};

/**
 * The decisions for the released types that the matcher cannot decide
 */
export const TYPE_MAPPINGS = path.join(__dirname, 'type-mappings.json');

export interface FullDatabaseOptions extends DatabaseBuilderOptions {
  /**
   * The released database whose L1 types the build keeps
   *
   * @default RELEASED_DATABASE
   */
  readonly releasedDatabase?: { readonly snapshot: string; readonly pins: string };
}

export class FullDatabase extends DatabaseBuilder {
  public defaultProblemGrouping = new ReportAudience('CDK_Team');

  constructor(db: SpecDatabase, options: FullDatabaseOptions) {
    super(db, options);

    this.importCloudFormationResourceSpec(path.join(SOURCES, 'CloudFormationResourceSpecification'))
      .importSamResourceSpec(path.join(SOURCES, 'CloudFormationResourceSpecification/us-east-1/100_sam'))
      .importCloudFormationRegistryResources(path.join(SOURCES, 'CloudFormationSchema'), patchCloudFormationRegistry)
      .importSamJsonSchema(path.join(SOURCES, 'SAMSpec/sam.schema.json'), patchSamTemplateSpec)
      .importTypeHistory({ ...(options.releasedDatabase ?? RELEASED_DATABASE), mappings: TYPE_MAPPINGS })
      .importCloudFormationDocs(path.join(SOURCES, 'CloudFormationDocumentation/CloudFormationDocumentation.json'))
      .importStatefulResources(path.join(SOURCES, 'StatefulResources/StatefulResources.json'))
      .importGetAttAllowList(path.join(SOURCES, 'CloudFormationGetAttAllowList/gettatt-allowlist.json'))
      .importArnTemplates(path.join(SOURCES, 'ArnTemplates/arn-templates.json'), path.join(SOURCES, 'ArnTemplates/arn-overrides.json'))
      .importOobRelationships(path.join(SOURCES, 'OobRelationships/relationships.json'), patchOobRelationships)
      .importCannedMetrics(path.join(SOURCES, 'CloudWatchConsoleServiceDirectory'))
      .importLogSources(path.join(SOURCES, 'LogSources/log-source-resource.json'))
      .importScrutinies()
      .importAugmentations()
      .importEventBridgeSchema(path.join(SOURCES, 'EventBridgeSchema'))
      .importCfnPrimaryIdentifierOverrides(path.join(SOURCES, 'CloudFormationRefOverrides/ref-overrides.json'));
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
}
