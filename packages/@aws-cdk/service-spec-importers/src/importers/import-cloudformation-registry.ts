import { PropertyType, RelationshipRef, RichPropertyType, SpecDatabase, TagVariant } from '@aws-cdk/service-spec-types';
import { locateFailure, Fail, failure, isFailure, Result, tryCatch, using, ref, isSuccess } from '@cdklabs/tskb';
import { ProblemReport, ReportAudience } from '../report';
import { PropertyBagBuilder, SpecBuilder } from '../resource-builder';
import { unionSchemas } from '../schema-manipulation/unify-schemas';
import { maybeUnion } from '../type-manipulation';
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

/**
 * Import a CloudFormation Registry resource specification into an existing resource
 *
 * The resource object has already been filled with properties and attributes from previous
 * revisions of the spec (perhaps the legacy CloudFormation spec, or the SAM spec, or
 * specs from different regions).
 */
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

  recurseProperties(resource, resourceBuilder, resourceFailure);

  // AWS::CloudFront::ContinuousDeploymentPolicy recently introduced a change where they're marking deprecatedProperties
  // as `/definitions/<Type>/properties/<Prop>` instead of `/properties/<Prop1>/<Prop2>/<Prop3>`. Ignore those, as it's
  // out-of-spec
  const deprecatedProperties = (resource.deprecatedProperties ?? [])
    .filter((p) => p.startsWith('/properties/'))
    .map(simplePropNameFromJsonPtr);
  resourceBuilder.markDeprecatedProperties(...deprecatedProperties);

  // Mark everything 'readOnlyProperties` as attributes. This removes them from 'properties', as
  // in the CloudFormation registry spec, fields cannot be attributes and properties at the same time.
  const attributeNames = findAttributes(resource).map(simplePropNameFromJsonPtr);
  resourceBuilder.markAsAttributes(attributeNames);

  // Mark all 'createOnlyProperties' as immutable.
  resourceBuilder.markAsImmutable((resource.createOnlyProperties ?? []).map(simplePropNameFromJsonPtr));

  handleFailure(handleTags(resourceFailure));
  return resourceBuilder.commit();

  function recurseProperties(source: ImplicitJsonSchemaRecord, target: PropertyBagBuilder, fail: Fail) {
    if (!source.properties) {
      throw new Error(`Not an object type with properties: ${JSON.stringify(source)}`);
    }

    const required = calculateDefinitelyRequired(source);

    for (const [name, property] of Object.entries(source.properties)) {
      try {
        let resolvedSchema = resolve(property);
        const relationships = collectPossibleRelationships(resolvedSchema);
        withResult(schemaTypeToModelType(name, resolvedSchema, fail.in(`property ${name}`)), (type) => {
          target.setProperty(name, {
            type,
            documentation: descriptionOf(resolvedSchema),
            required: required.has(name),
            defaultValue: describeDefault(resolvedSchema),
            relationshipRefs: relationships.length > 0 ? relationships : undefined,
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
   * Recursively extracts relationshipRef metadata from JSON schemas
   *
   * Finds relationshipRef objects that indicate this property references
   * another CloudFormation resource, and converts property paths to name.
   * This function handles the following cases:
   * Single relationship for property -> { type: 'string', relationshipRef: {...} }
   * When there are multiple relationships or the relationships are nested behind
   * layers of oneOf/anyOf/allOf the data looks like
   * { type: 'string', anyOf: [ { relationshipRef: {...} }, ...]}
   */
  function collectPossibleRelationships(schema: jsonschema.ConcreteSchema): RelationshipRef[] {
    if (jsonschema.isAnyType(schema)) {
      return [];
    }

    if (jsonschema.isCombining(schema)) {
      return jsonschema.innerSchemas(schema).flatMap((s) => collectPossibleRelationships(s));
    } else if (jsonschema.isArray(schema) && schema.items) {
      return collectPossibleRelationships(resolve(schema.items));
    } else if ('relationshipRef' in schema && jsonschema.isRelationshipRef(schema.relationshipRef)) {
      return [
        {
          cloudFormationType: schema.relationshipRef.typeName,
          propertyName: simplePropNameFromJsonPtr(schema.relationshipRef.propertyPath),
        },
      ];
    }
    return [];
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
      } else if (jsonschema.isOneOf(resolvedSchema) || jsonschema.isAnyOf(resolvedSchema)) {
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

        // Validate oneOf and anyOf types schema by validating whether there are two definitions in oneOf/anyOf
        // that has the same property name but different types. For simplicity, we do not validate if the types
        // are overlapping. We will add this case to the problem report. An sample schema would be i.e.
        // foo: { oneOf: [ { properties: { type: ObjectA } }, { properties: { type: ObjectB } }]}
        validateCombiningSchemaType(inner, fail);

        const convertedTypes = inner.map((t) => {
          if (jsonschema.isObject(t) && jsonschema.isRecordLikeObject(t)) {
            // The item in union type is an object with properties
            // We need to remove 'required' constraint from the object schema definition as we're dealing
            // with oneOf/anyOf. Note that we should ONLY remove 'required' when the 'required' constraint
            // refers to the object itself not the inner properties
            const refName = jsonschema.resolvedReferenceName(t);
            if ((t.title && t.required?.includes(t.title)) || (refName && t.required?.includes(refName))) {
              report.reportFailure(
                'interpreting',
                fail(
                  `${propertyName} is a union of objects. Merging into a single type and removing required fields for oneOf and anyOf.`,
                ),
              );
              return schemaTypeToModelType(nameHint, resolve({ ...t, required: undefined }), fail);
            }
          }
          return schemaTypeToModelType(nameHint, resolve(t), fail);
        });
        report.reportFailure('interpreting', ...convertedTypes.filter(isFailure));

        const types = convertedTypes.filter(isSuccess);
        removeUnionDuplicates(types);

        return maybeUnion(types);
      } else if (jsonschema.isAllOf(resolvedSchema)) {
        // FIXME: Do a proper thing here
        const firstResolved = resolvedSchema.allOf[0];
        return schemaTypeToModelType(nameHint, resolve(firstResolved), fail);
      } else if (jsonschema.containsRelationship(resolvedSchema)) {
        // relationshipRef schema - treat as string as the type property is not present when they appear inside anyOf/oneOf
        return { type: 'string' };
      } else {
        switch (resolvedSchema.type) {
          case 'string':
            if (resolvedSchema.format === 'timestamp') {
              return { type: 'date-time' };
            }
            return resolvedSchema.enum ? { type: 'string', allowedValues: resolvedSchema.enum } : { type: 'string' };

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
            return resolvedSchema.enum ? { type: 'integer', allowedValues: resolvedSchema.enum } : { type: 'integer' };

          case 'null':
            return { type: 'null' };
        }
      }

      throw new Error('Unable to produce type');
    });
  }

  function validateCombiningSchemaType(schema: jsonschema.ConcreteSchema[], fail: Fail) {
    schema.forEach((element, index) => {
      if (!jsonschema.isAnyType(element) && !jsonschema.isCombining(element)) {
        schema.slice(index + 1).forEach((next) => {
          if (!jsonschema.isAnyType(next) && !jsonschema.isCombining(next)) {
            if (element.title === next.title && element.type !== next.type) {
              report.reportFailure(
                'interpreting',
                fail(`Invalid schema with property name ${element.title} but types ${element.type} and ${next.type}`),
              );
            }
            const elementName = jsonschema.resolvedReferenceName(element);
            const nextName = jsonschema.resolvedReferenceName(next);
            if (elementName && nextName && elementName === nextName && element.type !== next.type) {
              report.reportFailure(
                'interpreting',
                fail(`Invalid schema with property name ${elementName} but types ${element.type} and ${next.type}`),
              );
            }
          }
        });
      }
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
        typeDefinitionBuilder.setFields({ documentation: schema.description });
      }
      if (jsonschema.isRecordLikeObject(schema)) {
        recurseProperties(schema, typeDefinitionBuilder, fail.in(`typedef ${nameHint}`));
      }
    }

    return { type: 'ref', reference: ref(typeDefinitionBuilder.commit()) };
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
          if (resourceBuilder.cloudFormationType === 'AWS::AutoScaling::AutoScalingGroup') {
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

  // I *think* this is guarding against services marking a property as BOTH
  // `createOnly` and `readOnly`: perhaps because from their PoV it's immutable.
  // That doesn't make it an attribute, though.
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
