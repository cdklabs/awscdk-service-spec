import { emptyDatabase } from '@aws-cdk/service-spec';
import * as sources from '@aws-cdk/service-spec-sources';
import { SchemaValidation } from '@aws-cdk/service-spec-sources';
import { Failures } from '@cdklabs/tskb';
import { readCloudFormationDocumentation } from './cloudformation-docs';
import { readCloudFormationRegistryResource } from './cloudformation-registry';
import { readStatefulResources } from './stateful-resources';

export interface BuildDatabaseOptions {
  readonly validateJsonSchema?: SchemaValidation;
}

export async function buildDatabase(options: BuildDatabaseOptions = {}) {
  const db = emptyDatabase();
  const fails: Failures = [];

  const resourceSpec = await sources.loadDefaultResourceSpecification();

  for (const resources of await sources.loadDefaultCloudFormationRegistryResources(options.validateJsonSchema)) {
    fails.push(...resources.failures);

    const region = db.allocate('region', {
      name: resources.regionName,
    });

    for (const resource of resources.resources) {
      const res = readCloudFormationRegistryResource({
        db,
        resource,
        fails,
        specResource: resourceSpec.ResourceTypes[resource.typeName],
      });
      db.link('regionHasResource', region, res);
    }
  }

  const docs = await sources.loadDefaultCloudFormationDocs();
  readCloudFormationDocumentation(db, docs, fails);

  readStatefulResources(db, await sources.loadDefaultStatefulResources(), fails);

  return { db, fails };
}
