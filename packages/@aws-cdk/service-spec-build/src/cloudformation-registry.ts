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
import { Fail, failure, Failures, isFailure, Result, tryCatch, using, ref } from '@cdklabs/tskb';

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

export function readCloudFormationRegistryResource(options: LoadCloudFormationRegistryResourceOptions) {
  const { db, resource, fails } = options;

  const typeDefinitions = new Map<jsonschema.Object, TypeDefinition>();

  const resolve = jsonschema.resolveReference(resource);

  const existing = db.lookup('resource', 'cloudFormationType', 'equals', resource.typeName);

  let res: Resource;
  if (existing.length === 0) {
    res = db.allocate('resource', {
      cloudFormationType: resource.typeName,
      documentation: resource.description,
      name: last(resource.typeName.split('::')),
      attributes: {},
      properties: {},
    });

    recurseProperties(resource, res.properties, failure.in(resource.typeName));
    // Every property that's a "readonly" property, remove it again from the `properties` collection.
    for (const propPtr of resource.readOnlyProperties ?? []) {
      const propName = simplePropNameFromJsonPtr(propPtr);
      delete res.properties[propName];
    }

    for (const propPtr of resource.deprecatedProperties ?? []) {
      const propName = simplePropNameFromJsonPtr(propPtr);
      (res.properties[propName] ?? {}).deprecated = Deprecation.WARN;
    }

    copyAttributes(resource, res.attributes, failure.in(resource.typeName));
  } else {
    // FIXME: Probably recurse into the properties to see if they are different...
    res = existing[0];
  }

  return res;

  function recurseProperties(source: ImplicitJsonSchemaRecord, target: ResourceProperties, fail: Fail) {
    if (!source.properties) {
      throw new Error(`Not an object type with properties: ${JSON.stringify(source)}`);
    }

    for (const [name, property] of Object.entries(source.properties)) {
      const resolved = resolve(property);

      withResult(schemaTypeToModelType(name, resolved, fail.in(`property ${name}`)), (type) => {
        target[name] = {
          type,
          documentation: resolved.schema.description,
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
      const nameHint = resolved.referenceName ?? propertyName;

      if (jsonschema.isOneOf(resolved.schema)) {
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
            return using(schemaTypeToModelType(nameHint, resolve(resolved.schema.items), fail), (element) => ({
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
    });
  }

  function schemaObjectToModelType(nameHint: string, schema: jsonschema.Object, fail: Fail): Result<PropertyType> {
    if (jsonschema.isMapLikeObject(schema)) {
      // Map type
      if (schema.additionalProperties && schema.patternProperties) {
        throw new Error('Map types should have only additionalProperties or patternProperties');
      }
      if (schema.additionalProperties) {
        return using(schemaTypeToModelType(nameHint, resolve(schema.additionalProperties), fail), (element) => ({
          type: 'map',
          element,
        }));
      } else if (schema.patternProperties) {
        return using(unifyAllSchemas(Object.values(schema.patternProperties)), (unifiedType) =>
          using(schemaTypeToModelType(nameHint, resolve(unifiedType), fail), (element) => ({ type: 'map', element })),
        );
      } else {
        // Fully untyped map
        // FIXME: is 'json' really a primitive type, or do we mean `Map<unknown>` ?
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
    if (jsonschema.isAllOf(schema) || jsonschema.isAnyOf(schema) || jsonschema.isOneOf(schema)) {
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
        fails.push(fail(`no property definition for: ${name}`));
        continue;
      }
      const resolved = resolve(source.properties[name]);

      withResult(schemaTypeToModelType(name, resolved, fail.in(`attribute ${name}`)), (type) => {
        target[name] = {
          type,
          documentation: resolved.schema.description,
          required: ifTrue((source.required ?? []).includes(name)),
        };
      });
    }
  }

  function withResult<A>(x: Result<A>, cb: (x: A) => void): void {
    if (isFailure(x)) {
      fails.push(x);
    } else {
      cb(x);
    }
  }
}

export function readCloudFormationRegistryServiceFromResource(
  options: LoadCloudFormationRegistryServiceFromResourceOptions,
): Service {
  const { db, resource, resourceTypeNameSeparator = '::' } = options;
  const parts = resource.typeName.split(resourceTypeNameSeparator);

  const name = `${parts[0]}-${parts[1]}`.toLowerCase();
  const shortName = parts[1].toLowerCase();

  const existing = db.lookup('service', 'name', 'equals', name);

  if (existing.length !== 0) {
    return existing[0];
  }

  const service = db.allocate('service', {
    name,
    shortName,
  });

  return service;
}

function last<A>(xs: A[]): A {
  return xs[xs.length - 1];
}

function ifTrue(x: boolean | undefined) {
  return x ? x : undefined;
}
