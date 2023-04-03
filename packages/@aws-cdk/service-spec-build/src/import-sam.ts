import { Region, Service, SpecDatabase } from '@aws-cdk/service-spec';
import { CloudFormationRegistryResource, jsonschema, SamTemplateSchema } from '@aws-cdk/service-spec-sources';
import { chain, failure, Failures, liftUndefined, unpackOr } from '@cdklabs/tskb';
import { importCloudFormationRegistryResource } from './cloudformation-registry';

export interface SamResourcesOptions {
  readonly db: SpecDatabase;
  readonly samSchema: SamTemplateSchema;
  readonly fails: Failures;
}

/**
 * Read SAM resources from a JSON schema that specifies an entire CloudFormation template
 *
 * We do this by finding the type definitions for AWS::Serverless::* resources
 * and converting them into something that looks like the CloudFormation Registry Schema
 * and reusing the loader function for that.
 */
export class SamResources {
  private readonly resolve: ReturnType<typeof jsonschema.makeResolver>;
  private readonly regions: Region[];
  private readonly db: SpecDatabase;

  constructor(private readonly options: SamResourcesOptions) {
    this.db = options.db;
    this.resolve = jsonschema.makeResolver(options.samSchema);
    this.regions = this.db.all('region');
  }

  public import() {
    const samResources = this.findSamResources();

    const samService = this.samService();

    for (const samResource of samResources) {
      // Convert resource definition to something that can go into the regular registry parser
      const resourceSpec = this.resourceDefinitionToRegistrySchema(samResource);

      const resource = importCloudFormationRegistryResource({
        db: this.db,
        fails: this.options.fails,
        resource: resourceSpec,
      });

      this.db.link('hasResource', samService, resource);
      for (const region of this.regions) {
        this.db.link('regionHasResource', region, resource);
      }
    }
  }

  private samService(): Service {
    const existing = this.db.lookup('service', 'name', 'equals', 'aws-sam');

    if (existing.length !== 0) {
      return existing.only();
    }

    const ret = this.db.allocate('service', {
      name: 'aws-sam',
      shortName: 'sam',
      capitalized: 'SAM',
    });

    for (const region of this.regions) {
      this.db.link('regionHasService', region, ret);
    }

    return ret;
  }

  private findSamResources() {
    const serverlessType = /::Serverless::/;
    return Object.values(this.options.samSchema.definitions ?? {})
      .map((x) => this.resolve(x).schema)
      .filter(jsonschema.isObject)
      .filter(jsonschema.isRecordLikeObject)
      .filter((def) => this.resourceType(def)?.match(serverlessType));
  }

  /**
   * Return the resource type of the resource schema, or undefined
   *
   * The schema definition here will represent a possible resource with a
   * fixed Type. For example:
   *
   * ```
   * "Type": {
   *     "enum": ["AWS::ACMPCA::Certificate"],
   *     "type": "string"
   * }
   * ```
   */
  private resourceType(maybeResource: jsonschema.RecordLikeObject): string | undefined {
    return unpackOr(
      chain(
        maybeResource,
        (x) => liftUndefined(x.properties.Type),
        (x) => this.resolve(x).schema,
        (x) => (jsonschema.isString(x) ? x : failure('Not a string')),
        (x) => (x.const ? x.const : x.enum?.length === 1 ? x.enum[0] : failure('Not an enum')),
      ),
      undefined,
    );
  }

  private resourceDefinitionToRegistrySchema(def: jsonschema.RecordLikeObject): CloudFormationRegistryResource {
    const typeName = this.resourceType(def) ?? '<dummy>';

    const { schema: propertiesSchema } = this.resolve(def.properties.Properties);

    const properties =
      jsonschema.isObject(propertiesSchema) && jsonschema.isRecordLikeObject(propertiesSchema)
        ? propertiesSchema.properties
        : {};

    return {
      typeName,
      description: `Definition of ${typeName}`,
      properties,

      // This will make sure that all reference are still valid. Yes this will contain
      // too much, but that's okay.
      definitions: this.options.samSchema.definitions,
    };
  }
}
