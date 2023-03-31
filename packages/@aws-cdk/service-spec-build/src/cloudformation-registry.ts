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
  unifyAllSchemas,
} from '@aws-cdk/service-spec-sources';
import { locateFailure, Fail, failure, Failures, isFailure, Result, tryCatch, using, ref } from '@cdklabs/tskb';

export interface LoadCloudFormationRegistryResourceOptions {
  readonly db: SpecDatabase;
  readonly resource: CloudFormationRegistryResource;
  readonly fails: Failures;
  readonly specResource?: resourcespec.ResourceType;
}
export interface LoadCloudFormationRegistryServiceFromResourceOptions {
  readonly db: SpecDatabase;
  readonly resource: CloudFormationRegistryResource;
  readonly resourceTypeNameSeparator?: string;
}

export function importCloudFormationRegistryResource(options: LoadCloudFormationRegistryResourceOptions) {
  const { db, resource, fails } = options;

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

    recurseProperties(resource, res.properties, resourceFailure);
    // Every property that's a "readonly" property, remove it again from the `properties` collection.
    for (const propPtr of resource.readOnlyProperties ?? []) {
      const propName = simplePropNameFromJsonPtr(propPtr);
      delete res.properties[propName];
    }

    for (const propPtr of resource.deprecatedProperties ?? []) {
      const propName = simplePropNameFromJsonPtr(propPtr);
      (res.properties[propName] ?? {}).deprecated = Deprecation.WARN;
    }

    copyAttributes(resource, res.attributes, resourceFailure.in('attributes'));

    handleFailure(handleTags(resourceFailure));

    return res;
  }

  function recurseProperties(source: ImplicitJsonSchemaRecord, target: ResourceProperties, fail: Fail) {
    if (!source.properties) {
      throw new Error(`Not an object type with properties: ${JSON.stringify(source)}`);
    }

    for (const [name, property] of Object.entries(source.properties)) {
      const resolved = resolve(property);

      withResult(schemaTypeToModelType(name, resolved, fail.in(`property ${name}`)), (type) => {
        target[name] = {
          type,
          documentation: descriptionOf(resolved.schema),
          required: ifTrue((source.required ?? []).includes(name)),
          defaultValue: describeDefault(resolved.schema),
        };
      });
    }
  }

  function schemaTypeToModelType(
    propertyName: string,
    resolved: jsonschema.ResolvedSchema,
    fail: Fail,
  ): Result<PropertyType> {
    return tryCatch(fail, (): Result<PropertyType> => {
      const nameHint = lastWord(resolved.referenceName) ?? propertyName;

      if (jsonschema.isAnyType(resolved.schema)) {
        return { type: 'json' };
      } else if (jsonschema.isOneOf(resolved.schema)) {
        // FIXME: Do a proper thing here
        const firstResolved: jsonschema.ResolvedSchema = {
          schema: resolved.schema.oneOf[0],
          referenceName: resolved.referenceName,
        };
        return schemaTypeToModelType(propertyName, firstResolved, fail);
      } else if (jsonschema.isAnyOf(resolved.schema)) {
        // FIME: Do a proper thing here
        const firstResolved: jsonschema.ResolvedSchema = {
          schema: resolved.schema.anyOf[0],
          referenceName: resolved.referenceName,
        };
        return schemaTypeToModelType(propertyName, firstResolved, fail);
      } else if (jsonschema.isAllOf(resolved.schema)) {
        // FIME: Do a proper thing here
        const firstResolved: jsonschema.ResolvedSchema = {
          schema: resolved.schema.allOf[0],
          referenceName: resolved.referenceName,
        };
        return schemaTypeToModelType(propertyName, firstResolved, fail);
      } else {
        switch (resolved.schema.type) {
          case 'string':
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
          case 'integer':
            return { type: 'number' };

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
          locateFailure('patternProperties')(unifyAllSchemas(Object.values(schema.patternProperties))),
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

      recurseProperties(schema, typeDef.properties, fail.in(`typedef ${nameHint}`));
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
        ...(source.readOnlyProperties ?? []).map(simplePropNameFromJsonPtr),
        ...Object.keys(options.specResource?.Attributes ?? {}),
      ]),
    )
      // In the Registry spec, compound attributes will look like 'Container/Prop', in the legacy
      // spec they will look like 'Container.Prop'. Some Registry resources incorrectly use '.' as well.
      // Normalize here.
      .map((x) => x.replace(/\./g, '/'))
      // Then drop compound attributes for now.
      .filter((x) => !x.includes('/'));

    for (const name of attributeNames) {
      if (!source.properties[name]) {
        fails.push(fail(`no definition for: ${name}`));
        continue;
      }
      const resolved = resolve(source.properties[name]);

      withResult(schemaTypeToModelType(name, resolved, fail.in(`attribute ${name}`)), (type) => {
        target[name] = {
          type,
          documentation: descriptionOf(resolved.schema),
          required: ifTrue((source.required ?? []).includes(name)),
        };
      });
    }
  }

  function handleTags(fail: Fail) {
    return tryCatch(fail, () => {
      const taggable = resource?.tagging?.taggable ?? resource.taggable ?? true;
      if (taggable) {
        const tagProp = simplePropNameFromJsonPtr(resource.tagging?.tagProperty ?? '/properties/Tags');
        const tagType = resource.properties[tagProp];
        if (!tagType) {
          fails.push(fail(`marked as taggable, but tagProperty does not exist: ${tagProp}`));
        } else {
          const resolvedType = resolve(tagType).schema;
          res.tagPropertyName = tagProp;
          if (res.cloudFormationType === 'AWS::AutoScaling::AutoScalingGroup') {
            res.tagType = 'asg';
          } else if (jsonschema.isObject(resolvedType) && jsonschema.isMapLikeObject(resolvedType)) {
            res.tagType = 'map';
          } else {
            res.tagType = 'standard';
          }
          res.properties[tagProp].type = { type: 'array', element: { type: 'builtIn', builtInType: 'tag' } };
        }
      }
    });
  }

  function withResult<A>(x: Result<A>, cb: (x: A) => void): void {
    if (isFailure(x)) {
      fails.push(x);
    } else {
      cb(x);
    }
  }

  function handleFailure(x: Result<void>) {
    if (isFailure(x)) {
      fails.push(x);
    }
  }
}

export function readCloudFormationRegistryServiceFromResource(
  options: LoadCloudFormationRegistryServiceFromResourceOptions,
): Service {
  const { db, resource, resourceTypeNameSeparator = '::' } = options;
  const parts = resource.typeName.split(resourceTypeNameSeparator);

  const name = `${parts[0]}-${parts[1]}`.toLowerCase();
  const capitalized = parts[1];
  const shortName = capitalized.toLowerCase();

  const existing = db.lookup('service', 'name', 'equals', name);

  if (existing.length !== 0) {
    return existing[0];
  }

  const service = db.allocate('service', {
    name,
    shortName,
    capitalized,
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
