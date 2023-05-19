import {
  Deprecation,
  PropertyType,
  Resource,
  ResourceProperties,
  Service,
  SpecDatabase,
  TypeDefinition,
} from '@aws-cdk/service-spec';
import {
  CloudFormationRegistryResource,
  ImplicitJsonSchemaRecord,
  jsonschema,
  simplePropNameFromJsonPtr,
  resourcespec,
  unionSchemas,
  ProblemReport,
  ReportAudience,
} from '@aws-cdk/service-spec-sources';
import { locateFailure, Fail, failure, isFailure, Result, tryCatch, using, ref, isSuccess } from '@cdklabs/tskb';
import { makeTypeHistory } from './type-history';

export interface LoadCloudFormationRegistryResourceOptions {
  readonly db: SpecDatabase;
  readonly resource: CloudFormationRegistryResource;
  readonly report: ProblemReport;
  readonly resourceSpec?: {
    spec?: resourcespec.ResourceType;
    types?: Record<string, resourcespec.PropertyType>;
  };
}
export interface LoadCloudFormationRegistryServiceFromResourceOptions {
  readonly db: SpecDatabase;
  readonly resource: CloudFormationRegistryResource;
  readonly resourceTypeNameSeparator?: string;
}

export function importCloudFormationRegistryResource(options: LoadCloudFormationRegistryResourceOptions) {
  const { db, resource } = options;
  const report = options.report.forAudience(ReportAudience.fromCloudFormationResource(resource.typeName));

  const typeDefinitions = new Map<jsonschema.Object, TypeDefinition>();

  const resolve = jsonschema.makeResolver(resource);

  const existing = db.lookup('resource', 'cloudFormationType', 'equals', resource.typeName);

  if (existing.length > 0) {
    // FIXME: Probably recurse into the properties to see if they are different...
    return existing[0];
  }

  let res: Resource; // Closed over by many of the functions here
  return allocateNewResource();

  function allocateNewResource() {
    const resourceFailure = failure.in(resource.typeName);

    res = db.allocate('resource', {
      cloudFormationType: resource.typeName,
      documentation: resource.description,
      name: last(resource.typeName.split('::')),
      attributes: {},
      properties: {},
    });

    recurseProperties(resource, res.properties, resourceFailure, options.resourceSpec?.spec);
    // Every property that's a "readonly" property, remove it again from the `properties` collection.
    for (const propPtr of findAttributes(resource)) {
      const attrName = simplePropNameFromJsonPtr(propPtr);
      // A property might exists as exactly the attribute name
      delete res.properties[attrName];
      // or as a version with "."s removed
      delete res.properties[attributeNameToPropertyName(attrName)];
    }

    for (const propPtr of resource.deprecatedProperties ?? []) {
      const propName = simplePropNameFromJsonPtr(propPtr);
      (res.properties[propName] ?? {}).deprecated = Deprecation.WARN;
    }

    copyAttributes(resource, res.attributes, resourceFailure.in('attributes'));

    handleFailure(handleTags(resourceFailure));

    return res;
  }

  function recurseProperties(
    source: ImplicitJsonSchemaRecord,
    target: ResourceProperties,
    fail: Fail,
    spec?: resourcespec.PropertyType,
  ) {
    if (!source.properties) {
      throw new Error(`Not an object type with properties: ${JSON.stringify(source)}`);
    }

    for (const [name, property] of Object.entries(source.properties)) {
      let resolved = resolve(property);

      if (spec?.Properties?.[name]?.PrimitiveType === 'Timestamp') {
        resolved = {
          ...resolved,
          schema: { type: 'string', format: 'timestamp' },
        };
      }

      withResult(schemaTypeToModelType(name, resolved, fail.in(`property ${name}`)), (type) => {
        target[name] = {
          type,
          previousTypes: getPreviousTypes(`${resource.typeName}.${name}`, [type]),
          documentation: descriptionOf(resolved.schema),
          required: ifTrue((source.required ?? []).includes(name)),
          defaultValue: describeDefault(resolved.schema),
        };
      });
    }
  }

  /**
   * Convert a JSON schema type to a type in the database model
   */
  function schemaTypeToModelType(
    propertyName: string,
    resolved: jsonschema.ResolvedSchema,
    fail: Fail,
  ): Result<PropertyType> {
    return tryCatch(fail, (): Result<PropertyType> => {
      const nameHint = lastWord(resolved.referenceName) ?? propertyName;

      if (jsonschema.isAnyType(resolved.schema)) {
        return { type: 'json' };
      } else if (jsonschema.isOneOf(resolved.schema) || jsonschema.isAnyOf(resolved.schema)) {
        const types = jsonschema
          .innerSchemas(resolved.schema)
          .map((t) => schemaTypeToModelType(propertyName, fakeResolved(t), fail));
        report.reportFailure('interpreting', ...types.filter(isFailure));
        return { type: 'union', types: types.filter(isSuccess) };
      } else if (jsonschema.isAllOf(resolved.schema)) {
        // FIXME: Do a proper thing here
        const firstResolved = fakeResolved(resolved.schema.allOf[0], resolved.referenceName);
        return schemaTypeToModelType(propertyName, firstResolved, fail);
      } else {
        switch (resolved.schema.type) {
          case 'string':
            if (resolved.schema.format === 'timestamp') {
              return { type: 'date-time' };
            }
            return { type: 'string' };

          case 'array':
            // FIXME: insertionOrder, uniqueItems
            return using(schemaTypeToModelType(nameHint, resolve(resolved.schema.items ?? true), fail), (element) => ({
              type: 'array',
              element,
            }));

          case 'boolean':
            return { type: 'boolean' };

          case 'object':
            return schemaObjectToModelType(nameHint, resolved.schema, fail);

          case 'number':
            return { type: 'number' };

          case 'integer':
            return { type: 'integer' };

          case 'null':
            return { type: 'null' };
        }
      }

      throw new Error('Unable to produce type');
    });
  }

  function schemaObjectToModelType(nameHint: string, schema: jsonschema.Object, fail: Fail): Result<PropertyType> {
    if (jsonschema.isMapLikeObject(schema)) {
      // Map type -- if we have 'additionalProperties', we will use that as the type of everything
      // (and assume it subsumes patterned types).
      if (schema.additionalProperties) {
        return using(schemaTypeToModelType(nameHint, resolve(schema.additionalProperties), fail), (element) => ({
          type: 'map',
          element,
        }));
      } else if (schema.patternProperties) {
        const unifiedPatternProps = fail.locate(
          locateFailure('patternProperties')(unionSchemas(...Object.values(schema.patternProperties))),
        );

        return using(unifiedPatternProps, (unifiedType) =>
          using(schemaTypeToModelType(nameHint, resolve(unifiedType), fail), (element) => ({ type: 'map', element })),
        );
      } else {
        // Fully untyped map
        // FIXME: is 'json' really a primitive type, or do we mean `Map<unknown>` or `Map<any>` ?
        return { type: 'json' };
      }
    }

    // Object type
    let typeDef = typeDefinitions.get(schema);
    if (!typeDef) {
      typeDef = db.allocate('typeDefinition', {
        name: nameHint,
        documentation: schema.description,
        properties: {},
      });
      db.link('usesType', res, typeDef);
      typeDefinitions.set(schema, typeDef);

      recurseProperties(
        schema,
        typeDef.properties,
        fail.in(`typedef ${nameHint}`),
        options.resourceSpec?.types?.[typeDef.name],
      );
    }

    return { type: 'ref', reference: ref(typeDef) };
  }

  function describeDefault(schema: jsonschema.ConcreteSchema): string | undefined {
    if (
      jsonschema.isAnyType(schema) ||
      jsonschema.isAllOf(schema) ||
      jsonschema.isAnyOf(schema) ||
      jsonschema.isOneOf(schema)
    ) {
      return undefined;
    }

    switch (schema.type) {
      case 'string':
      case 'number':
      case 'integer':
      case 'boolean':
        return schema.default !== undefined ? JSON.stringify(schema.default) : undefined;
    }

    return undefined;
  }

  function copyAttributes(source: CloudFormationRegistryResource, target: ResourceProperties, fail: Fail) {
    // The attributes are (currently) in `readOnlyResources`. Because of a representation issue, this doesn't cover
    // everything, so also look for the legacy spec.

    const attributeNames = Array.from(
      new Set([
        ...findAttributes(source).map(simplePropNameFromJsonPtr),
        ...Object.keys(options.resourceSpec?.spec?.Attributes ?? {}),
      ]),
    );

    for (const name of attributeNames) {
      try {
        const resolved = resolvePropertySchema(source, name);

        // Convert compound names into user-friendly names in dot-notation.
        // This is how they are publicized in the docs as well.
        const attributeName = name.split('/').join('.');

        withResult(schemaTypeToModelType(name, resolved, fail.in(`attribute ${name}`)), (type) => {
          target[attributeName] = {
            type,
            previousTypes: getPreviousTypes(`${resource.typeName}.${name}`, [type]),
            documentation: descriptionOf(resolved.schema),
            required: ifTrue((source.required ?? []).includes(name)),
          };
        });
      } catch {
        report.reportFailure('interpreting', fail(`no definition for: ${name}`));
      }
    }
  }

  function getPreviousTypes(key: string, history: PropertyType[]): PropertyType[] | undefined {
    const rewrittenHistory = makeTypeHistory(key, history);
    const previousTypes = rewrittenHistory.slice(0, -1);

    if (!previousTypes.length) {
      return undefined;
    }
    return previousTypes;
  }

  function handleTags(fail: Fail) {
    return tryCatch(fail, () => {
      const taggable = resource?.tagging?.taggable ?? resource.taggable ?? true;
      if (taggable) {
        const tagProp = simplePropNameFromJsonPtr(resource.tagging?.tagProperty ?? '/properties/Tags');
        const tagType = resource.properties[tagProp];
        if (!tagType) {
          report.reportFailure('interpreting', fail(`marked as taggable, but tagProperty does not exist: ${tagProp}`));
        } else {
          const resolvedType = resolve(tagType).schema;
          res.tagPropertyName = tagProp;
          const original = res.properties[tagProp].type;
          res.properties[tagProp].type = { type: 'tag', variant: 'standard', original };

          if (res.cloudFormationType === 'AWS::AutoScaling::AutoScalingGroup') {
            res.properties[tagProp].type = {
              type: 'tag',
              variant: 'asg',
              original,
            };
          } else if (jsonschema.isObject(resolvedType) && jsonschema.isMapLikeObject(resolvedType)) {
            res.properties[tagProp].type = { type: 'tag', variant: 'map', original };
          }
        }
      }
    });
  }

  function withResult<A>(x: Result<A>, cb: (x: A) => void): void {
    if (isFailure(x)) {
      report.reportFailure('interpreting', x);
    } else {
      cb(x);
    }
  }

  function handleFailure(x: Result<void>) {
    if (isFailure(x)) {
      report.reportFailure('interpreting', x);
    }
  }
}

function resolvePropertySchema(root: CloudFormationRegistryResource, name: string): jsonschema.ResolvedSchema {
  const resolve = jsonschema.makeResolver(root);

  // If a property exists with exactly that name (including . or /) then we use that property
  if (root.properties[name]) {
    return resolve(root.properties[name]);
  }

  // The property might also exist with a name that has any `.` stripped.
  const sanitizedName = attributeNameToPropertyName(name);
  if (root.properties[sanitizedName]) {
    return resolve(root.properties[sanitizedName]);
  }

  // Otherwise assume the name represents a compound attribute
  // In the Registry spec, compound attributes will look like 'Container/Prop'.
  // In the legacy spec they will look like 'Container.Prop'.
  // Some Registry resources incorrectly use '.' as well.
  // We accept both here.
  return name.split(/[\.\/]/).reduce(
    ({ schema }: jsonschema.ResolvedSchema, current: string) => {
      if (
        !(
          jsonschema.isConcreteSingleton(schema) &&
          !jsonschema.isAnyType(schema) &&
          'properties' in schema &&
          schema.properties[current]
        )
      ) {
        throw new Error(`no definition for: ${name}`);
      }

      return resolve(schema.properties[current]);
    },
    { schema: root as jsonschema.ConcreteSchema },
  );
}

export function readCloudFormationRegistryServiceFromResource(
  options: LoadCloudFormationRegistryServiceFromResourceOptions,
): Service {
  const { db, resource, resourceTypeNameSeparator = '::' } = options;
  const parts = resource.typeName.split(resourceTypeNameSeparator);

  const name = `${parts[0]}-${parts[1]}`.toLowerCase();
  const capitalized = parts[1];
  const shortName = capitalized.toLowerCase();
  const cloudFormationNamespace = `${parts[0]}${resourceTypeNameSeparator}${parts[1]}`;

  const existing = db.lookup('service', 'name', 'equals', name);

  if (existing.length !== 0) {
    return existing[0];
  }

  const service = db.allocate('service', {
    name,
    shortName,
    capitalized,
    cloudFormationNamespace,
  });

  return service;
}

function last<A>(xs: A[]): A {
  return xs[xs.length - 1];
}

function ifTrue(x: boolean | undefined) {
  return x ? x : undefined;
}

function descriptionOf(x: jsonschema.ConcreteSchema) {
  return jsonschema.isAnyType(x) ? undefined : x.description;
}

function lastWord(x?: string): string | undefined {
  if (!x) {
    return undefined;
  }

  return x.match(/([a-zA-Z0-9]+)$/)?.[1];
}

function fakeResolved(schema: jsonschema.ConcreteSchema, referenceName?: string): jsonschema.ResolvedSchema {
  return { schema, referenceName };
}

function findAttributes(resource: CloudFormationRegistryResource): string[] {
  const candidates = new Set(resource.readOnlyProperties ?? []);
  const exclusions = resource.createOnlyProperties ?? [];

  return Array.from(new Set([...candidates].filter((a) => !exclusions.includes(a))));
}

/**
 * Turns a compound name into its property equivalent
 * Compliance.Type -> ComplianceType
 */
function attributeNameToPropertyName(name: string) {
  return name.split('.').join('');
}
