import { PropertyType, RichPropertyType, SpecDatabase, TagVariant } from '@aws-cdk/service-spec-types';
import { locateFailure, Fail, failure, isFailure, Result, tryCatch, using, ref, isSuccess } from '@cdklabs/tskb';
import { ProblemReport, ReportAudience } from '../report';
import { PropertyBagBuilder, SpecBuilder } from '../resource-builder';
import { unionSchemas } from '../schema-manipulation/unify-schemas';
import {
  CloudFormationRegistryResource,
  ImplicitJsonSchemaRecord,
  jsonschema,
  simplePropNameFromJsonPtr,
} from '../types';

export interface LoadCloudFormationRegistryResourceOptions {
  readonly db: SpecDatabase;
  readonly resource: CloudFormationRegistryResource;
  readonly report: ProblemReport;
  readonly region?: string;
}

export function importCloudFormationRegistryResource(options: LoadCloudFormationRegistryResourceOptions) {
  const { db, resource } = options;
  const report = options.report.forAudience(ReportAudience.fromCloudFormationResource(resource.typeName));

  const resolve = jsonschema.makeResolver(resource);

  const specBuilder = new SpecBuilder(db);
  const resourceBuilder = specBuilder.resourceBuilder(resource.typeName, {
    description: resource.description,
    primaryIdentifier: resource.primaryIdentifier?.map((id) => id.slice(12)), // remove "/properties/" that reliably is included in each identifier
    region: options.region,
  });
  const resourceFailure = failure.in(resource.typeName);

  // Before we start adding properties, collect the set of property names that
  // are also attribute names.
  const conflictingAttributesAndPropNames = new Set(
    Object.keys(resourceBuilder.resource.properties).filter(
      (p) => resourceBuilder.resource.attributes[p] !== undefined,
    ),
  );

  recurseProperties(resource, resourceBuilder, resourceFailure);

  // AWS::CloudFront::ContinuousDeploymentPolicy recently introduced a change where they're marking deprecatedProperties
  // as `/definitions/<Type>/properties/<Prop>` instead of `/properties/<Prop1>/<Prop2>/<Prop3>`. Ignore those, as it's
  // out-of-spec
  const deprecatedProperties = (resource.deprecatedProperties ?? [])
    .filter((p) => p.startsWith('/properties/'))
    .map(simplePropNameFromJsonPtr);
  resourceBuilder.markDeprecatedProperties(...deprecatedProperties);

  // Mark everything 'readOnlyProperties` as attributes. However, in the old spec it is possible
  // that properties and attributes have the same names, with different types. If that happens (by
  // virtue of the property and attribute both existing), we need to retain
  // both, so don't move the property to attributes.
  const attributeNames = findAttributes(resource).map(simplePropNameFromJsonPtr);
  const safeAttributeNames = attributeNames.filter((a) => !conflictingAttributesAndPropNames.has(a));
  resourceBuilder.markAsAttributes(safeAttributeNames);

  // Mark all 'createOnlyProperties' as immutable.
  resourceBuilder.markAsImmutable((resource.createOnlyProperties ?? []).map(simplePropNameFromJsonPtr));

  handleFailure(handleTags(resourceFailure));
  return resourceBuilder.resource;

  function recurseProperties(source: ImplicitJsonSchemaRecord, target: PropertyBagBuilder, fail: Fail) {
    if (!source.properties) {
      throw new Error(`Not an object type with properties: ${JSON.stringify(source)}`);
    }

    const required = calculateDefinitelyRequired(source);

    for (const [name, property] of Object.entries(source.properties)) {
      try {
        let resolvedSchema = resolve(property);
        withResult(schemaTypeToModelType(name, resolvedSchema, fail.in(`property ${name}`)), (type) => {
          target.setProperty(name, {
            type,
            documentation: descriptionOf(resolvedSchema),
            required: required.has(name),
            defaultValue: describeDefault(resolvedSchema),
          });
        });
      } catch (e) {
        report.reportFailure(
          'interpreting',
          fail(`Skip generating property ${name} for resource ${resource.typeName} because of ${e}`),
        );
      }
    }
  }

  /**
   * Convert a JSON schema type to a type in the database model
   */
  function schemaTypeToModelType(
    propertyName: string,
    resolvedSchema: jsonschema.ResolvedSchema,
    fail: Fail,
  ): Result<PropertyType> {
    return tryCatch(fail, (): Result<PropertyType> => {
      const reference = jsonschema.resolvedReference(resolvedSchema);
      const referenceName = jsonschema.resolvedReferenceName(resolvedSchema);
      const nameHint = referenceName ? lastWord(referenceName) : lastWord(propertyName);

      if (jsonschema.isAnyType(resolvedSchema)) {
        return { type: 'json' };
      } else if (jsonschema.isOneOf(resolvedSchema) || jsonschema.isAnyOf(resolvedSchema) || jsonschema.isAllOf(resolvedSchema)) {
        const inner = jsonschema.innerSchemas(resolvedSchema);
        // The union type is a type definition
        // This is something we don't support at the moment as it's effectively a XOR for the property type
        // In future we should create an enum like class for this, but we cannot at the moment to maintain backwards compatibility
        // For now we assume the union is merged into a single object
        if (reference && inner.every((s) => jsonschema.isObject(s))) {
          report.reportFailure(
            'interpreting',
            fail(`Ref ${referenceName} is a union of objects. Merging into a single type.`),
          );
          const combinedType = unionSchemas(...inner) as jsonschema.ConcreteSchema;
          if (isFailure(combinedType)) {
            return combinedType;
          }
          return schemaTypeToModelType(nameHint, jsonschema.setResolvedReference(combinedType, reference), fail);
        }

        let convertedTypes;
        if (jsonschema.isOneOf(resolvedSchema)) {
          // There are two ways `oneOf` can be used:
          // 1. (Problematic Case) The property item itself is one of multiple object types,
          //    where each type references a definition
          // 2. (Not Problematic) The property item is a single type that references a definition,
          //    and that definition itself is one of multiple types of definitions.

          // The error occurs in the first case, where CDK treats only the first type in `oneOf` or `anyOf` as valid.
          // To fix the first case, we need to make sure we generate unique name hint for each referenced definition.
          convertedTypes = inner.map((t) => {
            const innerSchema = resolve(t);
            // Check if the inner schema contains '.properties'
            if (jsonschema.isObject(innerSchema) && !jsonschema.isMapLikeObject(innerSchema)) {
              // If the schema has a title, use it to differentiate different types in 'oneOf' or
              // 'anyOf' items
              if (innerSchema.title) {
                return schemaTypeToModelType(innerSchema.title, innerSchema, fail);
              }

              // If there is no title, check if the schema contains exactly one definition.
              // Resolve the definition to obtain the definition name to differentiate different
              // types in 'oneOf' or 'anyOf' items.
              const properties = Object.keys(innerSchema.properties);
              if (properties.length === 1) {
                return schemaTypeToModelType(properties[0], innerSchema, fail);
              }
            }
            return schemaTypeToModelType(nameHint, innerSchema, fail);
          });
        } else {
          convertedTypes = inner.map((t) => schemaTypeToModelType(nameHint, resolve(t), fail));
        }
        report.reportFailure('interpreting', ...convertedTypes.filter(isFailure));

        const types = convertedTypes.filter(isSuccess);
        removeUnionDuplicates(types);

        return { type: 'union', types };
      } else {
        switch (resolvedSchema.type) {
          case 'string':
            if (resolvedSchema.format === 'timestamp') {
              return { type: 'date-time' };
            }
            return { type: 'string' };

          case 'array':
            // FIXME: insertionOrder, uniqueItems
            return using(
              schemaTypeToModelType(collectionNameHint(nameHint), resolve(resolvedSchema.items ?? true), fail),
              (element) => ({
                type: 'array',
                element,
              }),
            );

          case 'boolean':
            return { type: 'boolean' };

          case 'object':
            return schemaObjectToModelType(nameHint, resolvedSchema, fail);

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
      return mapLikeSchemaToModelType(nameHint, schema, fail);
    } else {
      return objectLikeSchemaToModelType(nameHint, schema, fail);
    }
  }

  function mapLikeSchemaToModelType(
    nameHint: string,
    schema: jsonschema.MapLikeObject,
    fail: Fail,
  ): Result<PropertyType> {
    const innerNameHint = collectionNameHint(nameHint);

    // Map type. If 'patternProperties' is present we'll have it take precedence, because a lot of 'additionalProperties: true' are unintentially present.
    if (schema.patternProperties) {
      if (schema.additionalProperties === true) {
        report.reportFailure(
          'interpreting',
          fail('additionalProperties: true is probably a mistake if patternProperties is also present'),
        );
      }

      const unifiedPatternProps = fail.locate(
        locateFailure('patternProperties')(
          unionSchemas(
            ...Object.values(schema.patternProperties),
            // Use additionalProperties schema, but only if it's not 'true'.
            ...(schema.additionalProperties && schema.additionalProperties !== true
              ? [schema.additionalProperties]
              : []),
          ),
        ),
      );

      return using(unifiedPatternProps, (unifiedType) =>
        using(schemaTypeToModelType(innerNameHint, resolve(unifiedType), fail), (element) => ({
          type: 'map',
          element,
        })),
      );
    } else if (schema.additionalProperties) {
      return using(schemaTypeToModelType(innerNameHint, resolve(schema.additionalProperties), fail), (element) => ({
        type: 'map',
        element,
      }));
    }

    // Fully untyped map that's not a type
    // @todo types should probably also just be json since they are useless otherwise. Fix after this package is in use.
    // FIXME: is 'json' really a primitive type, or do we mean `Map<unknown>` or `Map<any>` ?
    return { type: 'json' };
  }

  function objectLikeSchemaToModelType(
    nameHint: string,
    schema: jsonschema.RecordLikeObject,
    fail: Fail,
  ): Result<PropertyType> {
    if (looksLikeBuiltinTagType(schema)) {
      return { type: 'tag' };
    }

    const { typeDefinitionBuilder, freshInSession } = resourceBuilder.typeDefinitionBuilder(nameHint, { schema });

    // If the type has no props, it's not a RecordLikeObject and we don't need to recurse
    // @todo The type should probably also just be json since they are useless otherwise. Fix after this package is in use.
    if (freshInSession) {
      if (schema.description) {
        typeDefinitionBuilder.typeDef.documentation = schema.description;
      }
      if (jsonschema.isRecordLikeObject(schema)) {
        recurseProperties(schema, typeDefinitionBuilder, fail.in(`typedef ${nameHint}`));
      }
    }

    return { type: 'ref', reference: ref(typeDefinitionBuilder.typeDef) };
  }

  function looksLikeBuiltinTagType(schema: jsonschema.Object): boolean {
    if (!jsonschema.isRecordLikeObject(schema)) {
      return false;
    }

    const eligibleTypeNames = ['Tag', 'Tags'];
    const expectedStringProperties = ['Key', 'Value'];

    const resolvedProps = expectedStringProperties.map((prop) =>
      schema.properties[prop] ? resolve(schema.properties[prop]) : undefined,
    );

    return (
      Object.keys(schema.properties).length === resolvedProps.length &&
      resolvedProps.every((x) => x !== undefined && jsonschema.isString(x)) &&
      eligibleTypeNames.includes(lastWord(jsonschema.resolvedReferenceName(schema) ?? ''))
    );
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

  function handleTags(fail: Fail) {
    return tryCatch(fail, () => {
      const taggable = resource?.tagging?.taggable ?? resource.taggable ?? true;
      if (taggable) {
        const tagProp = simplePropNameFromJsonPtr(resource.tagging?.tagProperty ?? '/properties/Tags');
        const tagType = resource.properties[tagProp];
        if (!tagType) {
          report.reportFailure('interpreting', fail(`marked as taggable, but tagProperty does not exist: ${tagProp}`));
        } else {
          const resolvedType = resolve(tagType);

          let variant: TagVariant = 'standard';
          if (resourceBuilder.resource.cloudFormationType === 'AWS::AutoScaling::AutoScalingGroup') {
            variant = 'asg';
          } else if (jsonschema.isObject(resolvedType) && jsonschema.isMapLikeObject(resolvedType)) {
            variant = 'map';
          }

          resourceBuilder.setTagInformation({
            tagPropertyName: tagProp,
            variant,
          });
        }
      }
    });
  }

  /**
   * Derive a 'required' array from the oneOfs/anyOfs/allOfs in this source
   */
  function calculateDefinitelyRequired(source: RequiredContainer): Set<string> {
    const ret = new Set([...(source.required ?? [])]);

    if (source.oneOf) {
      setExtend(ret, setIntersect(...source.oneOf.map(calculateDefinitelyRequired)));
    }
    if (source.anyOf) {
      setExtend(ret, setIntersect(...source.anyOf.map(calculateDefinitelyRequired)));
    }
    if (source.allOf) {
      setExtend(ret, ...source.allOf.map(calculateDefinitelyRequired));
    }

    return ret;
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

function descriptionOf(x: jsonschema.ConcreteSchema) {
  return jsonschema.isAnyType(x) ? undefined : x.description;
}

function lastWord(x: string): string {
  return x.match(/([a-zA-Z0-9]+)$/)?.[1] ?? x;
}

/**
 * Return the names of properties in the Registry Spec that are actually attributes
 */
function findAttributes(resource: CloudFormationRegistryResource): string[] {
  const candidates = new Set(resource.readOnlyProperties ?? []);

  // FIXME: I think this might be incorrect
  const exclusions = resource.createOnlyProperties ?? [];

  return Array.from(new Set([...candidates].filter((a) => !exclusions.includes(a))));
}

/**
 * Turn the namehint into a namehint for collections
 */
function collectionNameHint(nameHint: string) {
  return `${nameHint}Items`;
}

interface RequiredContainer {
  readonly required?: string[];
  readonly oneOf?: RequiredContainer[];
  readonly anyOf?: RequiredContainer[];
  readonly allOf?: RequiredContainer[];
}

function setIntersect<A>(...xs: Set<A>[]): Set<A> {
  if (xs.length === 0) {
    return new Set();
  }
  const ret = new Set(xs[0]);
  for (const x of xs) {
    for (const e of ret) {
      if (!x.has(e)) {
        ret.delete(e);
      }
    }
  }
  return ret;
}

function setExtend<A>(ss: Set<A>, ...xs: Set<A>[]): void {
  for (const e of xs.flatMap((x) => Array.from(x))) {
    ss.add(e);
  }
}

function removeUnionDuplicates(types: PropertyType[]) {
  if (types.length === 0) {
    throw new Error('Union cannot be empty');
  }

  for (let i = 0; i < types.length; ) {
    const type = new RichPropertyType(types[i]);

    let dupe = false;
    for (let j = i + 1; j < types.length; j++) {
      dupe ||= type.javascriptEquals(types[j]);
    }

    if (dupe) {
      types.splice(i, 1);
    } else {
      i += 1;
    }
  }

  if (types.length === 0) {
    throw new Error('Whoopsie, union ended up empty');
  }
}
