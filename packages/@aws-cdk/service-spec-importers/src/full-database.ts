import path from 'node:path';
import { SpecDatabase, emptyDatabase } from '@aws-cdk/service-spec-types';
import { DatabaseBuilder, DatabaseBuilderOptions } from './db-builder';

const SOURCES = path.join(__dirname, '../../../../sources');

export class FullDatabase {
  public static buildDatabase(db: SpecDatabase = emptyDatabase(), options: DatabaseBuilderOptions) {
    return new FullDatabase(db, options).build();
  }

  private builder: DatabaseBuilder;

  constructor(db: SpecDatabase, options: DatabaseBuilderOptions) {
    this.builder = new DatabaseBuilder(db, options);
  }

  public async build() {
    this.builder
      .importCloudFormationResourceSpec(path.join(SOURCES, 'CloudFormationResourceSpecification'))
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

    return this.builder.build();
  }
}
