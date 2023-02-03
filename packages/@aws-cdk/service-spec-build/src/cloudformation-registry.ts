import { PropertyType, Region, ResourceProperties, SpecDatabase } from "@aws-cdk/service-spec";
import { CloudFormationRegistryResource, ImplicitJsonSchemaObject, jsonschema } from "@aws-cdk/service-spec-sources";

export function loadCloudFormationRegistryResource(db: SpecDatabase, region: Region, resource: CloudFormationRegistryResource) {
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
        type: schemaTypeToModelType(resolved.referenceName ?? name, resolved.schema),
        documentation: resolved.schema.description,
        required: ifTrue((source.required ?? []).includes(name)),
      };
    }
  }

  function schemaTypeToModelType(nameHint: string, type: jsonschema.ConcreteSchema): PropertyType {
    switch (type.type) {
      case 'string':
        break;
      case 'array':
        break;
      case 'boolean':
        break;
      case 'object':
        break;
    }
  }
}


function last<A>(xs: A[]): A {
  return xs[xs.length - 1];
}

function ifTrue(x: boolean | undefined) {
  return x ? x : undefined;
}