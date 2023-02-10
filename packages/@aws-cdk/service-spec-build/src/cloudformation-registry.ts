import { PropertyType, Region, ResourceProperties, SpecDatabase, TypeDefinition } from '@aws-cdk/service-spec';
import { CloudFormationRegistryResource, ImplicitJsonSchemaRecord, jsonschema, unifyAllSchemas } from '@aws-cdk/service-spec-sources';
import { Fail, failure, Failures, isFailure, Result, tryCatch, using, ref } from '@cdklabs/tskb';

export function loadCloudFormationRegistryResource(db: SpecDatabase, region: Region, resource: CloudFormationRegistryResource, fails: Failures) {
  const typeDefinitions = new Map<jsonschema.Object, TypeDefinition>();

  const resolve = jsonschema.resolveReference(resource);

  // FIXME: Resource may already exist, in which case we should look it up.

  const res = db.allocate('resource', {
    cloudFormationType: resource.typeName,
    documentation: resource.description,
    name: last(resource.typeName.split('::')),
    attributes: {},
    properties: {},
  });

  recurseProperties(resource, res.properties, failure.in(resource.typeName));

  db.link('regionHasResource', region, res);

  function recurseProperties(source: ImplicitJsonSchemaRecord, target: ResourceProperties, fail: Fail) {
    if (!source.properties) {
      throw new Error(`Not an object type with properties: ${JSON.stringify(source)}`);
    }

    for (const [name, property] of Object.entries(source.properties)) {
      const resolved = resolve(property);
      const type = schemaTypeToModelType(name, resolved, fail.in(`property ${name}`));

      if (isFailure(type)) {
        fails.push(type);
      } else {
        target[name] = {
          type,
          documentation: resolved.schema.description,
          required: ifTrue((source.required ?? []).includes(name)),
        };
      }
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
}


function last<A>(xs: A[]): A {
  return xs[xs.length - 1];
}

function ifTrue(x: boolean | undefined) {
  return x ? x : undefined;
}