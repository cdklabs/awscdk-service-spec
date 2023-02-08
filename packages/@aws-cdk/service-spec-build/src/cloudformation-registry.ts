import { PropertyType, Region, ResourceProperties, SpecDatabase, TypeDefinition } from '@aws-cdk/service-spec';
import { CloudFormationRegistryResource, ImplicitJsonSchemaObject, jsonschema } from '@aws-cdk/service-spec-sources';
import { ref } from '@cdklabs/tskb';
import { Fail, failure, Failures, isFailure, Result, tryCatch, using } from './result';

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

  function recurseProperties(source: ImplicitJsonSchemaObject, target: ResourceProperties, fail: Fail) {
    if (source.additionalProperties || source.patternProperties) {
      throw new Error(`recurseProperties: expecting a fixed record type, without additionalProperties(${source.additionalProperties}) or patternProperties (${source.patternProperties})`);
    }

    for (const [name, property] of Object.entries(source.properties)) {
      const resolved = resolve(property);
      const type = schemaTypeToModelType(name, resolved, fail.in(`property ${name}`));

      if (isFailure(type)) {
        console.log(type);
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
          if (resolved.schema.additionalProperties || resolved.schema.patternProperties) {
            // Map type
            if (!isEmpty(resolved.schema.properties)) {
              throw new Error('Map types should not have properties');
            }
            if (resolved.schema.additionalProperties && resolved.schema.patternProperties) {
              throw new Error('Map types should have only additionalProperties or patternProperties');
            }
            if (resolved.schema.additionalProperties) {
              return using(
                schemaTypeToModelType(nameHint, resolve(resolved.schema.additionalProperties), fail),
                element => ({ type: 'map', element }));
            } else if (resolved.schema.patternProperties) {
              const types = Object.values(resolved.schema.patternProperties);
              if (types.length !== 1) {
                throw new Error('Map types should have exactly 1 patternProperties');
              }
              return using(
                schemaTypeToModelType(nameHint, resolve(types[0]), fail),
                element => ({ type: 'map', element }));
            }
          } else {
            // Object type
            let typeDef = typeDefinitions.get(resolved.schema);
            if (!typeDef) {
              typeDef = db.allocate('typeDefinition', {
                name: nameHint,
                documentation: resolved.schema.description,
                properties: {},
              });
              db.link('usesType', res, typeDef);
              typeDefinitions.set(resolved.schema, typeDef);

              recurseProperties(resolved.schema, typeDef.properties, fail.in(`typedef ${nameHint}`));
            }

            return { type: 'ref', reference: ref(typeDef) };
          }
      }

      throw new Error('TypeScript should have checked exhaustiveness here');
    });
  }
}


function last<A>(xs: A[]): A {
  return xs[xs.length - 1];
}

function ifTrue(x: boolean | undefined) {
  return x ? x : undefined;
}

function isEmpty<A>(x: Record<string, A>) {
  return Object.keys(x).length === 0;
}
