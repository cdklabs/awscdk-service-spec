import { Region, Service, SpecDatabase } from '@aws-cdk/service-spec-types';
import {
  CloudFormationRegistryResource,
  jsonschema,
  ProblemReport,
  SamTemplateSchema,
} from '@aws-cdk/service-spec-sources';
import { chain, failure, liftUndefined, unpackOr } from '@cdklabs/tskb';
import { importCloudFormationRegistryResource } from './import-cloudformation-registry';

export interface SamResourcesOptions {
  readonly db: SpecDatabase;
  readonly samSchema: SamTemplateSchema;
  readonly report: ProblemReport;
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
  private readonly defaultTransform = 'AWS::Serverless-2016-10-31';

  constructor(private readonly options: SamResourcesOptions) {
    this.db = options.db;
    this.resolve = jsonschema.makeResolver(options.samSchema);
    this.regions = this.db.all('region');
  }

  public import() {
    const samResources = this.findSamResources();
    const samService = this.samService();
    const cloudFormationTransform = this.cloudFormationTransform();

    for (const samResource of samResources) {
      // Convert resource definition to something that can go into the regular registry parser
      const resourceSpec = this.resourceDefinitionToRegistrySchema(samResource);

      const resource = importCloudFormationRegistryResource({
        db: this.db,
        report: this.options.report,
        resource: resourceSpec,
      });
      resource.cloudFormationTransform = cloudFormationTransform;

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
      cloudFormationNamespace: 'AWS::Serverless',
    });

    for (const region of this.regions) {
      this.db.link('regionHasService', region, ret);
    }

    return ret;
  }

  private findSamResources(): jsonschema.RecordLikeObject[] {
    const serverlessType = /::Serverless::/;
    const definitions = Object.values(this.options.samSchema.definitions ?? {});

    const serverlessResources = new Array();

    for (const def of definitions) {
      const resolvedSchema = this.resolve(def);

      if (
        jsonschema.isObject(resolvedSchema) &&
        jsonschema.isRecordLikeObject(resolvedSchema) &&
        this.resourceType(resolvedSchema)?.match(serverlessType)
      ) {
        serverlessResources.push(resolvedSchema);
      }
    }

    return serverlessResources;
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
        (x) => this.resolve(x),
        (x) => (jsonschema.isString(x) ? x : failure('Not a string')),
        (x) => (x.const ? x.const : x.enum?.length === 1 ? x.enum[0] : failure('Not an enum')),
      ),
      undefined,
    );
  }

  private resourceDefinitionToRegistrySchema(def: jsonschema.RecordLikeObject): CloudFormationRegistryResource {
    const typeName = this.resourceType(def) ?? '<dummy>';

    const emptyObject: jsonschema.RecordLikeObject = { type: 'object', additionalProperties: false, properties: {} };
    const propertiesSchema = this.resolve(def.properties.Properties ?? emptyObject);

    let properties = {};
    let required;
    if (jsonschema.isObject(propertiesSchema) && jsonschema.isRecordLikeObject(propertiesSchema)) {
      properties = propertiesSchema.properties;
      required = propertiesSchema.required;
    }

    return {
      typeName,
      description: `Definition of ${typeName}`,
      properties,
      required,

      // This will make sure that all reference are still valid. Yes this will contain
      // too much, but that's okay.
      definitions: this.options.samSchema.definitions,
    };
  }

  private cloudFormationTransform(): string {
    return (this.options.samSchema?.properties?.Transform as any)?.enum?.[0] ?? this.defaultTransform;
  }
}
