import * as path from 'node:path';
import { DatabaseBuilder, DatabaseBuilderOptions, ReportAudience } from '@aws-cdk/service-spec-importers';
import { patchOobRelationships } from '@aws-cdk/service-spec-importers/src/patches/oob-relationship-patches';
import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { Augmentations } from './augmentations';
import { patchCloudFormationRegistry } from './patches/registry-patches';
import { patchSamTemplateSpec } from './patches/sam-patches';
import { Scrutinies } from './scrutinies';

const SOURCES = path.join(__dirname, '../../../../sources');

export class FullDatabase extends DatabaseBuilder {
  public defaultProblemGrouping = new ReportAudience('CDK_Team');

  constructor(db: SpecDatabase, options: DatabaseBuilderOptions) {
    super(db, options);

    this.importCloudFormationResourceSpec(path.join(SOURCES, 'CloudFormationResourceSpecification'))
      .importSamResourceSpec(path.join(SOURCES, 'CloudFormationResourceSpecification/us-east-1/100_sam'))
      .importCloudFormationRegistryResources(path.join(SOURCES, 'CloudFormationSchema'), patchCloudFormationRegistry)
      .importSamJsonSchema(path.join(SOURCES, 'SAMSpec/sam.schema.json'), patchSamTemplateSpec)
      .importCloudFormationDocs(path.join(SOURCES, 'CloudFormationDocumentation/CloudFormationDocumentation.json'))
      .importStatefulResources(path.join(SOURCES, 'StatefulResources/StatefulResources.json'))
      .importGetAttAllowList(path.join(SOURCES, 'CloudFormationGetAttAllowList/gettatt-allowlist.json'))
      .importArnTemplates(path.join(SOURCES, 'ArnTemplates/arn-templates.json'))
      .importOobRelationships(path.join(SOURCES, 'OobRelationships/relationships.json'), patchOobRelationships)
      .importCannedMetrics(
        path.join(SOURCES, 'CloudWatchConsoleServiceDirectory/CloudWatchConsoleServiceDirectory.json'),
      )
      .importLogSources(path.join(SOURCES, 'LogSources/log-source-resource.json'))
      .importScrutinies()
      .importAugmentations()
      .importEventBridgeSchema(path.join(SOURCES, 'EventBridgeSchema'));
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
