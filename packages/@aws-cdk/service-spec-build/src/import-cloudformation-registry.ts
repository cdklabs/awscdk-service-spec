import {
  Deprecation,
  PropertyType,
  Resource,
  ResourceProperties,
  RichPropertyType,
  Service,
  SpecDatabase,
  TagVariant,
  TypeDefinition,
} from '@aws-cdk/service-spec';
import {
  CloudFormationRegistryResource,
  ImplicitJsonSchemaRecord,
  jsonschema,
  simplePropNameFromJsonPtr,
  resourcespec,
  unionSchemas,
  ProblemReport,
  ReportAudience,
} from '@aws-cdk/service-spec-sources';
import { locateFailure, Fail, failure, isFailure, Result, tryCatch, using, ref, isSuccess } from '@cdklabs/tskb';
import { makeTypeHistory } from './type-history';

export interface LoadCloudFormationRegistryResourceOptions {
  readonly db: SpecDatabase;
  readonly resource: CloudFormationRegistryResource;
  readonly report: ProblemReport;
  readonly resourceSpec?: {
    spec?: resourcespec.ResourceType;
    types?: Record<string, resourcespec.PropertyType>;
  };
}
export interface LoadCloudFormationRegistryServiceFromResourceOptions {
  readonly db: SpecDatabase;
  readonly resource: { readonly typeName: string };
  readonly resourceTypeNameSeparator?: string;
}

export function importCloudFormationRegistryResource(options: LoadCloudFormationRegistryResourceOptions) {
  const { db, resource } = options;
  const report = options.report.forAudience(ReportAudience.fromCloudFormationResource(resource.typeName));

  const typeDefinitions = new Map<string, TypeDefinition>();

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

    recurseProperties(resource, res.properties, resourceFailure, options.resourceSpec?.spec);
    // Every property that's a "readonly" property, remove it again from the `properties` collection.
    for (const propPtr of findAttributes(resource)) {
      const attrName = simplePropNameFromJsonPtr(propPtr);
      // A property might exists as exactly the attribute name
      delete res.properties[attrName];
      // or as a version with "."s removed
      delete res.properties[attributeNameToPropertyName(attrName)];
    }

    for (const propPtr of resource.deprecatedProperties ?? []) {
      const propName = simplePropNameFromJsonPtr(propPtr);
      (res.properties[propName] ?? {}).deprecated = Deprecation.WARN;
    }

    copyAttributes(resource, res.attributes, resourceFailure.in('attributes'));

    handleFailure(handleTags(resourceFailure));

    return res;
  }

  function recurseProperties(
    source: ImplicitJsonSchemaRecord,
    target: ResourceProperties,
    fail: Fail,
    spec?: resourcespec.PropertyType,
  ) {
    if (!source.properties) {
      throw new Error(`Not an object type with properties: ${JSON.stringify(source)}`);
    }

    const required = calculateDefinitelyRequired(source);

    for (const [name, property] of Object.entries(source.properties)) {
      let resolvedSchema = resolve(property);

      if (spec?.Properties?.[name]?.PrimitiveType === 'Timestamp') {
        resolvedSchema = jsonschema.setResolvedReference(
          {
            type: 'string',
            format: 'timestamp',
          },
          jsonschema.resolvedReference(resolvedSchema),
        );
      }

      withResult(schemaTypeToModelType(name, resolvedSchema, fail.in(`property ${name}`)), (type) => {
        target[name] = {
          type,
          previousTypes: getPreviousTypes(`${resource.typeName}.${name}`, [type]),
          documentation: descriptionOf(resolvedSchema),
          required: ifTrue(required.has(name)),
          defaultValue: describeDefault(resolvedSchema),
        };
      });
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

        const convertedTypes = inner.map((t) => schemaTypeToModelType(nameHint, resolve(t), fail));
        report.reportFailure('interpreting', ...convertedTypes.filter(isFailure));

        // TODO: Simplify union
        const types = convertedTypes.filter(isSuccess);
        removeUnionDuplicates(types);

        return { type: 'union', types };
      } else if (jsonschema.isAllOf(resolvedSchema)) {
        // FIXME: Do a proper thing here
        const firstResolved = resolvedSchema.allOf[0];
        return schemaTypeToModelType(nameHint, resolve(firstResolved), fail);
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
      } else if (!jsonschema.resolvedReference(schema)) {
        // Fully untyped map that's not a type
        // @todo types should probably also just be json since they are useless otherwise. Fix after this package is in use.
        // FIXME: is 'json' really a primitive type, or do we mean `Map<unknown>` or `Map<any>` ?
        return { type: 'json' };
      }
    }

    // Object type
    if (looksLikeBuiltinTagType(schema)) {
      return { type: 'tag' };
    }

    const typeKey = resource.typeName + nameHint + JSON.stringify(schema);
    if (!typeDefinitions.has(typeKey)) {
      const typeDef = db.allocate('typeDefinition', {
        name: nameHint,
        documentation: schema.description,
        properties: {},
      });
      db.link('usesType', res, typeDef);
      typeDefinitions.set(typeKey, typeDef);

      // If the type has no props, it's not a RecordLikeObject and we don't need to recurse
      // @todo The type should probably also just be json since they are useless otherwise. Fix after this package is in use.
      if (jsonschema.isRecordLikeObject(schema)) {
        recurseProperties(
          schema,
          typeDef.properties,
          fail.in(`typedef ${nameHint}`),
          options.resourceSpec?.types?.[typeDef.name],
        );
      }
    }

    return { type: 'ref', reference: ref(typeDefinitions.get(typeKey)!) };
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

  function copyAttributes(source: CloudFormationRegistryResource, target: ResourceProperties, fail: Fail) {
    // The attributes are (currently) in `readOnlyResources`. Because of a representation issue, this doesn't cover
    // everything, so also look for the legacy spec.

    const attributeNames = Array.from(
      new Set([
        ...findAttributes(source).map(simplePropNameFromJsonPtr),
        ...Object.keys(options.resourceSpec?.spec?.Attributes ?? {}),
      ]),
    );

    for (const name of attributeNames) {
      try {
        const resolvedSchema = resolvePropertySchema(source, name);

        // Convert compound names into user-friendly names in dot-notation.
        // This is how they are publicized in the docs as well.
        const attributeName = name.split('/').join('.');

        withResult(schemaTypeToModelType(name, resolvedSchema, fail.in(`attribute ${name}`)), (type) => {
          target[attributeName] = {
            type,
            previousTypes: getPreviousTypes(`${resource.typeName}.${name}`, [type]),
            documentation: descriptionOf(resolvedSchema),
            required: ifTrue((source.required ?? []).includes(name)),
          };
        });
      } catch {
        report.reportFailure('interpreting', fail(`no definition for: ${name}`));
      }
    }
  }

  function getPreviousTypes(key: string, history: PropertyType[]): PropertyType[] | undefined {
    const rewrittenHistory = makeTypeHistory(key, history);
    const previousTypes = rewrittenHistory.slice(0, -1);

    if (!previousTypes.length) {
      return undefined;
    }
    return previousTypes;
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
          if (res.cloudFormationType === 'AWS::AutoScaling::AutoScalingGroup') {
            variant = 'asg';
          } else if (jsonschema.isObject(resolvedType) && jsonschema.isMapLikeObject(resolvedType)) {
            variant = 'map';
          }

          res.tagInformation = {
            tagPropertyName: tagProp,
            variant,
          };
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

function resolvePropertySchema(root: CloudFormationRegistryResource, name: string): jsonschema.ResolvedSchema {
  const resolve = jsonschema.makeResolver(root);

  // If a property exists with exactly that name (including . or /) then we use that property
  if (root.properties[name]) {
    return resolve(root.properties[name]);
  }

  // The property might also exist with a name that has any `.` stripped.
  const sanitizedName = attributeNameToPropertyName(name);
  if (root.properties[sanitizedName]) {
    return resolve(root.properties[sanitizedName]);
  }

  // Otherwise assume the name represents a compound attribute
  // In the Registry spec, compound attributes will look like 'Container/Prop'.
  // In the legacy spec they will look like 'Container.Prop'.
  // Some Registry resources incorrectly use '.' as well.
  // We accept both here.
  return name.split(/[\.\/]/).reduce((schema: jsonschema.ResolvedSchema, current: string) => {
    if (
      !(
        jsonschema.isConcreteSingleton(schema) &&
        !jsonschema.isAnyType(schema) &&
        'properties' in schema &&
        schema.properties[current]
      )
    ) {
      throw new Error(`no definition for: ${name}`);
    }

    return resolve(schema.properties[current]);
  }, root as any);
}

export function readCloudFormationRegistryServiceFromResource(
  options: LoadCloudFormationRegistryServiceFromResourceOptions,
): Service {
  const { db, resource, resourceTypeNameSeparator = '::' } = options;
  const parts = resource.typeName.split(resourceTypeNameSeparator);

  const name = `${parts[0]}-${parts[1]}`.toLowerCase();
  const capitalized = parts[1];
  const shortName = capitalized.toLowerCase();
  const cloudFormationNamespace = `${parts[0]}${resourceTypeNameSeparator}${parts[1]}`;

  const existing = db.lookup('service', 'name', 'equals', name);

  if (existing.length !== 0) {
    return existing[0];
  }

  const service = db.allocate('service', {
    name,
    shortName,
    capitalized,
    cloudFormationNamespace,
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

function lastWord(x: string): string {
  return x.match(/([a-zA-Z0-9]+)$/)?.[1] ?? x;
}

function findAttributes(resource: CloudFormationRegistryResource): string[] {
  const candidates = new Set(resource.readOnlyProperties ?? []);
  const exclusions = resource.createOnlyProperties ?? [];

  return Array.from(new Set([...candidates].filter((a) => !exclusions.includes(a))));
}

/**
 * Turns a compound name into its property equivalent
 * Compliance.Type -> ComplianceType
 */
function attributeNameToPropertyName(name: string) {
  return name.split('.').join('');
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
      dupe ||= type.assignableTo(types[j]);
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
