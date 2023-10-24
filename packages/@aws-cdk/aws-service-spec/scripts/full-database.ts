import * as path from 'node:path';
import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { DatabaseBuilder, DatabaseBuilderOptions, ReportAudience } from '@aws-cdk/service-spec-importers';
import { Augmentations } from './augmentations';
import { Scrutinies } from './scrutinies';

const SOURCES = path.join(__dirname, '../../../../sources');

export class FullDatabase extends DatabaseBuilder {
  public defaultProblemGrouping = new ReportAudience('CDK_Team');

  constructor(db: SpecDatabase, options: DatabaseBuilderOptions) {
    super(db, options);

    this.importCloudFormationResourceSpec(path.join(SOURCES, 'CloudFormationResourceSpecification'))
      .importSamResourceSpec(path.join(SOURCES, 'CloudFormationResourceSpecification/us-east-1/100_sam'))
      .importCloudFormationRegistryResources(path.join(SOURCES, 'CloudFormationSchema'))
      .importSamJsonSchema(path.join(SOURCES, 'SAMSpec/sam.schema.json'))
      .importCloudFormationDocs(path.join(SOURCES, 'CloudFormationDocumentation/CloudFormationDocumentation.json'))
      .importStatefulResources(path.join(SOURCES, 'StatefulResources/StatefulResources.json'))
      .importCannedMetrics(
        path.join(SOURCES, 'CloudWatchConsoleServiceDirectory/CloudWatchConsoleServiceDirectory.json'),
      )
      .importScrutinies()
      .importAugmentations();
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
