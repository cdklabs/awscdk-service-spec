import { PropertyType, Region, ResourceProperties, SpecDatabase, TypeDefinition } from "@aws-cdk/service-spec";
import { CloudFormationRegistryResource, ImplicitJsonSchemaObject, jsonschema } from "@aws-cdk/service-spec-sources";
import { ref } from "@cdklabs/tskb";

export function loadCloudFormationRegistryResource(db: SpecDatabase, region: Region, resource: CloudFormationRegistryResource) {
  const typeDefinitions = new Map<jsonschema.Object, TypeDefinition>();


  const resolve = jsonschema.resolveReference(resource);

  const res = db.allocate('resource', {
    cloudFormationType: resource.typeName,
    documentation: resource.description,
    name: last(resource.typeName.split('::')),
    attributes: {},
    properties: {},
  });

  recurseProperties(resource, res.properties);

  db.link('regionHasResource', region, res);

  function recurseProperties(source: ImplicitJsonSchemaObject, target: ResourceProperties) {
    if (source.additionalProperties || source.patternProperties) {
      throw new Error(`recurseProperties: expecting a fixed record type, without additionalProperties(${source.additionalProperties}) or patternProperties (${source.patternProperties})`);
    }

    for (const [name, property] of Object.entries(source.properties)) {
      const resolved = resolve(property);
      target[name] = {
        type: schemaTypeToModelType(name, resolved),
        documentation: resolved.schema.description,
        required: ifTrue((source.required ?? []).includes(name)),
      };
    }
  }

  function schemaTypeToModelType(propertyName: string, resolved: jsonschema.ResolvedSchema): PropertyType {
    const nameHint = resolved.referenceName ?? propertyName;

    switch (resolved.schema.type) {
      case 'string':
        return 'string';
      case 'array':
        // FIXME: insertionOrder, uniqueItems
        return {
          type: 'array',
          element: schemaTypeToModelType(nameHint, resolve(resolved.schema.items)),
        };
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
            return {
              type: 'map',
              element: schemaTypeToModelType(nameHint, resolve(resolved.schema.additionalProperties)),
            };
          } else if (resolved.schema.patternProperties) {
            const types = Object.values(resolved.schema.patternProperties);
            if (types.length !== 1) {
              throw new Error('Map types should have exactly 1 patternProperties');
            }
            return {
              type: 'map',
              element: schemaTypeToModelType(nameHint, resolve(types[0])),
            };
          }
        } else {
          // Object type
          let typeDef = typeDefinitions.get(resolved.schema)
          if (!typeDef) {
            typeDef = db.allocate('typeDefinition', {
              name: nameHint,
              documentation: resolved.schema.description,
              properties: {},
            });
            db.link('usesType', res, typeDef);

            recurseProperties(resolved.schema, typeDef.properties);
          }

          return { type: 'ref', reference: ref(typeDef) };
        }
    }

    throw new Error('TypeScript should have checked exhaustiveness here');
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