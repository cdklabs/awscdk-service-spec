import { PropertyType, EventTypeDefinition } from '@aws-cdk/service-spec-types';
import { locateFailure, Fail, isFailure, Result, tryCatch, using, ref, isSuccess } from '@cdklabs/tskb';
import {
  calculateDefinitelyRequired,
  collectionNameHint,
  isEmptyObjectType,
  removeUnionDuplicates,
} from './schema-helpers';
import { PropertyBagBuilder } from '../../event-builder';
import { BoundProblemReport } from '../../report';
import { unionSchemas } from '../../schema-manipulation/unify-schemas';
import { maybeUnion } from '../../type-manipulation';
import { ImplicitJsonSchemaRecord, jsonschema } from '../../types';

export interface SchemaConverterContext {
  eventBuilder: import('../../event-builder').EventBuilder;
  report: BoundProblemReport;
  resolve: (schema: any) => any;
  eventFailure: Fail;
  createdTypes?: EventTypeDefinition[];
}

/**
 * Create all type definitions from an EventBridge detail schema
 * Handles both empty object types and types with properties
 *
 * @returns Object containing the root type definition and all created types
 */
export function createTypeDefinitionsFromSchema(
  detailSchema: any,
  detailTypeName: string,
  ctx: SchemaConverterContext,
): { rootTypeDef: EventTypeDefinition; createdTypes: EventTypeDefinition[] } {
  const createdTypes: EventTypeDefinition[] = [];
  const ctxWithTracking = { ...ctx, createdTypes };

  let rootTypeDef: EventTypeDefinition;

  if (isEmptyObjectType(detailSchema)) {
    // For empty object types, create a simple type definition
    const { eventTypeDefinitionBuilder } = ctx.eventBuilder.eventTypeDefinitionBuilder(detailTypeName);
    rootTypeDef = eventTypeDefinitionBuilder.commit();
    createdTypes.push(rootTypeDef);
  } else if (detailSchema.properties) {
    // Create the root type definition and all nested types
    const { eventTypeDefinitionBuilder } = ctx.eventBuilder.eventTypeDefinitionBuilder(detailTypeName, {
      schema: detailSchema,
    });

    // Recurse into the detail type's properties to build ALL type definitions
    recurseProperties(detailSchema, eventTypeDefinitionBuilder, ctx.eventFailure, ctxWithTracking);

    // Commit the root type definition
    rootTypeDef = eventTypeDefinitionBuilder.commit();
    createdTypes.push(rootTypeDef);
  } else {
    // Unexpected case: not an object with properties and not an empty object
    ctx.report.reportFailure(
      'interpreting',
      ctx.eventFailure(`Detail type has unexpected structure: ${JSON.stringify(detailSchema)}`),
    );
    throw new Error('Invalid detail schema structure');
  }

  return { rootTypeDef, createdTypes };
}

/**
 * Recursively process schema properties and create type definitions
 */
export function recurseProperties(
  source: ImplicitJsonSchemaRecord,
  target: PropertyBagBuilder,
  fail: Fail,
  ctx: SchemaConverterContext,
) {
  if (!source.properties) {
    throw new Error(`Not an object type with properties: ${JSON.stringify(source)}`);
  }

  const required = calculateDefinitelyRequired(source);

  for (const [name, property] of Object.entries(source.properties)) {
    try {
      let resolvedSchema = ctx.resolve(property);
      withResult(ctx, schemaTypeToModelType(name, resolvedSchema, fail.in(`property ${name}`), ctx), (type) => {
        target.setProperty(name, {
          type,
          required: required.has(name),
        });
      });
    } catch (e) {
      ctx.report.reportFailure('interpreting', fail(`Skip generating property ${name} because of ${e}`));
    }
  }
}

/**
 * Convert schema type to model type, creating all nested type definitions
 */
export function schemaTypeToModelType(
  propertyName: string,
  resolvedSchema: jsonschema.ResolvedSchema,
  fail: Fail,
  ctx: SchemaConverterContext,
): Result<PropertyType> {
  return tryCatch(fail, (): Result<PropertyType> => {
    const reference = jsonschema.resolvedReference(resolvedSchema);
    const referenceName = jsonschema.resolvedReferenceName(resolvedSchema);
    const nameHint = referenceName ? referenceName : propertyName;

    if (jsonschema.isAnyType(resolvedSchema)) {
      return { type: 'json' };
    } else if (jsonschema.isOneOf(resolvedSchema) || jsonschema.isAnyOf(resolvedSchema)) {
      const inner = jsonschema.innerSchemas(resolvedSchema);

      if (reference && inner.every((s) => jsonschema.isObject(s))) {
        ctx.report.reportFailure(
          'interpreting',
          fail(`Ref ${referenceName} is a union of objects. Merging into a single type.`),
        );
        const combinedType = unionSchemas(...inner) as jsonschema.ConcreteSchema;
        if (isFailure(combinedType)) {
          return combinedType;
        }
        return schemaTypeToModelType(nameHint, jsonschema.setResolvedReference(combinedType, reference), fail, ctx);
      }

      validateCombiningSchemaType(inner, fail, ctx);

      const convertedTypes = inner.map((t) => {
        if (jsonschema.isObject(t) && jsonschema.isRecordLikeObject(t)) {
          const refName = jsonschema.resolvedReferenceName(t);
          if ((t.title && t.required?.includes(t.title)) || (refName && t.required?.includes(refName))) {
            ctx.report.reportFailure(
              'interpreting',
              fail(
                `${propertyName} is a union of objects. Merging into a single type and removing required fields for oneOf and anyOf.`,
              ),
            );
            return schemaTypeToModelType(nameHint, ctx.resolve({ ...t, required: undefined }), fail, ctx);
          }
        }
        return schemaTypeToModelType(nameHint, ctx.resolve(t), fail, ctx);
      });
      ctx.report.reportFailure('interpreting', ...convertedTypes.filter(isFailure));

      const types = convertedTypes.filter(isSuccess);
      removeUnionDuplicates(types);

      return maybeUnion(types);
    } else if (jsonschema.isAllOf(resolvedSchema)) {
      const firstResolved = resolvedSchema.allOf[0];
      return schemaTypeToModelType(nameHint, ctx.resolve(firstResolved), fail, ctx);
    } else if (jsonschema.containsRelationship(resolvedSchema)) {
      return { type: 'string' };
    } else {
      switch (resolvedSchema.type) {
        case 'string':
          if (resolvedSchema.format === 'timestamp') {
            return { type: 'date-time' };
          }
          return { type: 'string' };

        case 'array':
          return using(
            schemaTypeToModelType(collectionNameHint(nameHint), ctx.resolve(resolvedSchema.items ?? true), fail, ctx),
            (element) => ({
              type: 'array',
              element,
            }),
          );

        case 'boolean':
          return { type: 'boolean' };

        case 'object':
          return schemaObjectToModelType(nameHint, resolvedSchema, fail, ctx);

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

function schemaObjectToModelType(
  nameHint: string,
  schema: jsonschema.Object,
  fail: Fail,
  ctx: SchemaConverterContext,
): Result<PropertyType> {
  if (jsonschema.isMapLikeObject(schema)) {
    return mapLikeSchemaToModelType(nameHint, schema, fail, ctx);
  } else {
    return objectLikeSchemaToModelType(nameHint, schema, fail, ctx);
  }
}

function mapLikeSchemaToModelType(
  nameHint: string,
  schema: jsonschema.MapLikeObject,
  fail: Fail,
  ctx: SchemaConverterContext,
): Result<PropertyType> {
  const innerNameHint = collectionNameHint(nameHint);

  if (schema.patternProperties) {
    if (schema.additionalProperties === true) {
      ctx.report.reportFailure(
        'interpreting',
        fail('additionalProperties: true is probably a mistake if patternProperties is also present'),
      );
    }

    const unifiedPatternProps = fail.locate(
      locateFailure('patternProperties')(
        unionSchemas(
          ...Object.values(schema.patternProperties),
          ...(schema.additionalProperties && schema.additionalProperties !== true ? [schema.additionalProperties] : []),
        ),
      ),
    );

    return using(unifiedPatternProps, (unifiedType) =>
      using(schemaTypeToModelType(innerNameHint, ctx.resolve(unifiedType), fail, ctx), (element) => ({
        type: 'map',
        element,
      })),
    );
  } else if (schema.additionalProperties) {
    return using(
      schemaTypeToModelType(innerNameHint, ctx.resolve(schema.additionalProperties), fail, ctx),
      (element) => ({
        type: 'map',
        element,
      }),
    );
  }

  return { type: 'json' };
}

function objectLikeSchemaToModelType(
  nameHint: string,
  schema: jsonschema.RecordLikeObject,
  fail: Fail,
  ctx: SchemaConverterContext,
): Result<PropertyType> {
  const { eventTypeDefinitionBuilder, freshInSession } = ctx.eventBuilder.eventTypeDefinitionBuilder(nameHint, {
    schema,
  });

  if (freshInSession) {
    if (jsonschema.isRecordLikeObject(schema)) {
      recurseProperties(schema, eventTypeDefinitionBuilder, fail.in(`typedef ${nameHint}`), ctx);
    }
  }

  const typeDef = eventTypeDefinitionBuilder.commit();

  if (ctx.createdTypes) {
    ctx.createdTypes.push(typeDef);
  }

  return { type: 'ref', reference: ref(typeDef) };
}

function validateCombiningSchemaType(schema: jsonschema.ConcreteSchema[], fail: Fail, ctx: SchemaConverterContext) {
  schema.forEach((element, index) => {
    if (!jsonschema.isAnyType(element) && !jsonschema.isCombining(element)) {
      schema.slice(index + 1).forEach((next) => {
        if (!jsonschema.isAnyType(next) && !jsonschema.isCombining(next)) {
          if (element.title === next.title && element.type !== next.type) {
            ctx.report.reportFailure(
              'interpreting',
              fail(`Invalid schema with property name ${element.title} but types ${element.type} and ${next.type}`),
            );
          }
          const elementName = jsonschema.resolvedReferenceName(element);
          const nextName = jsonschema.resolvedReferenceName(next);
          if (elementName && nextName && elementName === nextName && element.type !== next.type) {
            ctx.report.reportFailure(
              'interpreting',
              fail(`Invalid schema with property name ${elementName} but types ${element.type} and ${next.type}`),
            );
          }
        }
      });
    }
  });
}

function withResult<A>(ctx: SchemaConverterContext, x: Result<A>, cb: (x: A) => void): void {
  if (isFailure(x)) {
    ctx.report.reportFailure('interpreting', x);
  } else {
    cb(x);
  }
}
