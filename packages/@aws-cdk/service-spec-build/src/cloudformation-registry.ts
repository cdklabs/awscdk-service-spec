import { PropertyType, Resource, ResourceProperties, SpecDatabase, TypeDefinition } from '@aws-cdk/service-spec';
import { CloudFormationRegistryResource, ImplicitJsonSchemaRecord, jsonschema, simplePropNameFromJsonPtr, resourcespec, unifyAllSchemas } from '@aws-cdk/service-spec-sources';
import { Fail, failure, Failures, isFailure, Result, tryCatch, using, ref } from '@cdklabs/tskb';

export interface LoadCloudFormationRegistryResourceOptions {
  readonly db: SpecDatabase;
  readonly resource: CloudFormationRegistryResource;
  readonly fails: Failures;
  readonly specResource?: resourcespec.ResourceType;
}

export function loadCloudFormationRegistryResource(options: LoadCloudFormationRegistryResourceOptions) {
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

      withResult(
        schemaTypeToModelType(name, resolved, fail.in(`property ${name}`)),
        type => {
          target[name] = {
            type,
            documentation: resolved.schema.description,
            required: ifTrue((source.required ?? []).includes(name)),
          };
        });
    }
  }

  function schemaTypeToModelType(propertyName: string, resolved: jsonschema.ResolvedSchema, fail: Fail): Result<PropertyType> {
    return tryCatch(fail, (): Result<PropertyType> => {
      const nameHint = resolved.referenceName ?? propertyName;

      switch (resolved.schema.type) {
        case 'string':
          return 'string';

        case 'array':
          // FIXME: insertionOrder, uniqueItems
          return using(
            schemaTypeToModelType(nameHint, resolve(resolved.schema.items), fail),
            element => ({ type: 'array', element }));

        case 'boolean':
          return 'boolean';

        case 'object':
          return schemaObjectToModelType(nameHint, resolved.schema, fail);

        case 'number':
        case 'integer':
          return 'number';
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
        return using(
          schemaTypeToModelType(nameHint, resolve(schema.additionalProperties), fail),
          element => ({ type: 'map', element }));
      } else if (schema.patternProperties) {
        return using(
          unifyAllSchemas(Object.values(schema.patternProperties)),
          unifiedType => using(
            schemaTypeToModelType(nameHint, resolve(unifiedType), fail),
            element => ({ type: 'map', element })));
      } else {
        // Fully untyped map
        // FIXME: is 'json' really a primitive type, or do we mean `Map<unknown>` ?
        return 'json';
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

  function copyAttributes(source: CloudFormationRegistryResource, target: ResourceProperties, fail: Fail) {
    // The attributes are (currently) in `readOnlyResources`. Because of a representation issue, this doesn't cover
    // everything, so also look for the legacy spec.
    const attributeNames = Array.from(new Set([
      ...(source.readOnlyProperties ?? []).map(simplePropNameFromJsonPtr),
      ...Object.keys(options.specResource?.Attributes ?? {}),
    ]));

    for (const name of attributeNames) {
      const resolved = resolve(source.properties[name]);

      withResult(
        schemaTypeToModelType(name, resolved, fail.in(`attribute ${name}`)),
        type => {
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


function last<A>(xs: A[]): A {
  return xs[xs.length - 1];
}

function ifTrue(x: boolean | undefined) {
  return x ? x : undefined;
}