import { patching, types } from '@aws-cdk/service-spec-importers';
import { jsonschema } from '@aws-cdk/service-spec-importers/lib/types';

export const SERVICE_PATCHERS: Array<patching.JsonLensPatcher> = [];

/**
 * Register an unnamed exception patcher
 */
export function registerServicePatches(...patcher: patching.JsonLensPatcher[]) {
  SERVICE_PATCHERS.push(...patcher);
}

/**
 * Only call the inner patcher if we are inside the given resource type
 *
 * It will still be invoked at every JSON node in that document.
 */
export function forResource(resource: string, patcher: patching.JsonObjectPatcher): patching.JsonLensPatcher {
  return (lens) => {
    const root = lens.rootPath[0];
    if (
      lens.isJsonObject() &&
      root.isJsonObject() &&
      (root.value as unknown as types.CloudFormationRegistryResource).typeName === resource
    ) {
      patcher(lens);
    }
  };
}

/**
 * Replace the type of a property, only if the property actually exists.
 *
 * NOTE: returns a new patcher. Still needs to be applied to a lens.
 */
export function replaceResourceProperty(
  propertyName: string,
  newSchema: types.jsonschema.Schema,
  reason: patching.Reason,
): patching.JsonObjectPatcher {
  return (lens) => {
    if (lens.jsonPointer === `/properties/${propertyName}`) {
      lens.replaceValue(reason.reason, newSchema);
    }
  };
}

/**
 * Remove a property, only if the property actually exists.
 *
 * NOTE: returns a new patcher. Still needs to be applied to a lens.
 */
export function removeResourceProperty(propertyName: string, reason: patching.Reason): patching.JsonObjectPatcher {
  return (lens) => {
    if (lens.jsonPointer === `/properties`) {
      lens.removeProperty(reason.reason, propertyName);
    }
  };
}

/**
 * Replace the type of a definition's property, only if the property actually exists.
 *
 * NOTE: returns a new patcher. Still needs to be applied to a lens.
 */
export function replaceDefinitionProperty(
  definitionName: string,
  propertyName: string,
  newSchema: types.jsonschema.Schema,
  reason: patching.Reason,
): patching.JsonObjectPatcher {
  return (lens) => {
    if (lens.jsonPointer === `/definitions/${definitionName}/properties/${propertyName}`) {
      lens.replaceValue(reason.reason, newSchema);
    }
  };
}

/**
 * Rename the a type definition, only if the definition actually exists.
 *
 * NOTE: returns a new patcher. Still needs to be applied to a lens.
 */
export function renameDefinition(
  oldName: string,
  newName: string,
  reason: patching.Reason,
): patching.JsonObjectPatcher {
  return (lens) => {
    if (lens.jsonPointer === `/definitions`) {
      lens.renameProperty(reason.reason, oldName, newName);
    }
    if (lens.value.$ref === `#/definitions/${oldName}`) {
      lens.recordPatch(reason.reason, {
        op: 'replace',
        path: lens.jsonPointer,
        value: {
          ...lens.value,
          $ref: `#/definitions/${newName}`,
        },
      });
    }
  };
}

/**
 * Replace the a type definition, only if the definition actually exists.
 *
 * NOTE: returns a new patcher. Still needs to be applied to a lens.
 */
export function replaceDefinition(
  definition: string,
  schema: types.jsonschema.Schema,
  reason: patching.Reason,
): patching.JsonObjectPatcher {
  return (lens) => {
    if (lens.jsonPointer === `/definitions/${definition}`) {
      lens.replaceValue(reason.reason, schema);
    }
  };
}

/**
 * Add a definition, only if the definition doesn't yet exist
 *
 * NOTE: returns a new patcher. Still needs to be applied to a lens.
 */
export function addDefinitions(
  definitions: Record<string, types.jsonschema.Schema>,
  reason: patching.Reason,
): patching.JsonObjectPatcher {
  return (lens) => {
    if (patching.isRoot(lens) && lens.value.definitions === undefined) {
      // No '/definitions' in this type
      lens.addProperty(reason.reason, 'definitions', definitions);
    } else if (lens.jsonPointer === '/definitions') {
      for (const [definitionName, newSchema] of Object.entries(definitions)) {
        if (lens.value[definitionName] === undefined) {
          lens.addProperty(reason.reason, definitionName, newSchema);
        }
      }
    }
  };
}

/**
 * Functional Programming Interfaces
 * For when declarative is not enough
 */
export namespace fp {
  /**
   * Patch a resource at a JSON Pointer location
   */
  export function patchResourceAt<Tree, TypeName extends string = string>(
    resource: TypeName,
    pointer: string,
    reason: patching.Reason,
    patch: patching.fp.Patch<Tree>,
  ): patching.Patcher<patching.JsonLens> {
    return (lens) => {
      const root = lens.rootPath[0];
      if ((root.value as unknown as types.CloudFormationRegistryResource).typeName === resource) {
        patching.fp.patchAt(pointer, reason, patch)(lens);
      }
    };
  }

  /**
   * Patch a resource at the root
   */
  export function patchResource<
    Tree extends types.CloudFormationRegistryResource & {
      typeName: TypeName;
    },
    TypeName extends string = string,
  >(resource: TypeName, reason: patching.Reason, patch: patching.fp.Patch<Tree>): patching.Patcher<patching.JsonLens> {
    return patchResourceAt(resource, '', reason, patch);
  }

  /**
   * Remove property from readOnlyProperties list
   * Note: You might also need to remove the property completely
   */
  export function removeFromReadOnlyProperties<TypeName extends string = string>(
    resource: TypeName,
    remove: string[],
    reason: patching.Reason,
  ): patching.Patcher<patching.JsonLens> {
    return patchResourceAt<types.CloudFormationRegistryResource['readOnlyProperties']>(
      resource,
      '/readOnlyProperties',
      reason,
      (readOnlyProperties) => {
        for (const prop of remove) {
          const idx = readOnlyProperties?.indexOf(`/properties/${prop}`);
          if (idx !== undefined && idx >= 0) {
            delete readOnlyProperties?.[idx];
          }
        }
        return readOnlyProperties;
      },
    );
  }

  /**
   * Add a property to `properties`
   */
  export function addProperty<TypeName extends string = string>(
    resource: TypeName,
    propertyName: string,
    propertyType: string,
    reason: patching.Reason,
  ): patching.Patcher<patching.JsonLens> {
    return patchResourceAt<types.CloudFormationRegistryResource['properties']>(
      resource,
      '/properties',
      reason,
      (properties) => {
        if(!(propertyName in properties)) {
          properties[propertyName] = {
            type: propertyType 
            /**
             * Currently this only works for the basic case. 
             * 
             * TODO: need to support the case where it uses $ref to reference an existing type in "definitions" 
             * e.g.
             * "MasterUserSecret" : {
                "$ref" : "#/definitions/MasterUserSecret",
                "description" : "The secret managed by RDS in AWS Secrets Manager for the master user password.\n For more information, see [Password management with Secrets Manager](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html) in the *Amazon RDS User Guide.*"
              },
             * and also the case where `type: "array"`, in which case we have to add an `items` property as well. 
             * e.g.
             * "ProcessorFeatures" : {
                "type" : "array",
                "items" : {
                  "$ref" : "#/definitions/ProcessorFeature"
                },
                "description" : "The number of CPU cores and the number of threads per core for the DB instance class of the DB instance.\n This setting doesn't apply to Amazon Aurora or RDS Custom DB instances."
              },
             */
          } as types.jsonschema.Schema;
        }
        return properties;
      },
    );
  }

  /**
   * Add properties to readOnlyProperties
   * A patch will only be created if to property does not exist yet
   */
  export function addReadOnlyProperties<TypeName extends string = string>(
    resource: TypeName,
    additional: string[],
    reason: patching.Reason,
  ): patching.Patcher<patching.JsonLens> {
    return patchResourceAt<types.CloudFormationRegistryResource['readOnlyProperties']>(
      resource,
      '/readOnlyProperties',
      reason,
      (readOnlyProperties) => {
        for (const prop of additional) {
          const propPtr = `/properties/${prop}`;
          if (!readOnlyProperties?.includes(propPtr)) {
            readOnlyProperties?.push(`/properties/${prop}`);
          }
        }
        return readOnlyProperties;
      },
    );
  }

  /**
   * Replace properties in readOnlyProperties with a different one
   */
  export function replaceReadOnlyProperties<TypeName extends string = string>(
    resource: TypeName,
    replace: {
      [oldName: string]: string;
    },
    reason: patching.Reason,
  ): patching.Patcher<patching.JsonLens> {
    return patchResourceAt<types.CloudFormationRegistryResource['readOnlyProperties']>(
      resource,
      '/readOnlyProperties',
      reason,
      (readOnlyProperties = []) => {
        for (const [oldName, newName] of Object.entries(replace)) {
          const idx = readOnlyProperties.indexOf(`/properties/${oldName}`);
          if (readOnlyProperties[idx]) {
            readOnlyProperties[idx] = `/properties/${newName}`;
          }
        }
        return readOnlyProperties;
      },
    );
  }

  /**
   * Rename properties of a resource, only if the old property exists
   */
  export function renameProperties<TypeName extends string = string>(
    resource: TypeName,
    rename: {
      [oldName: string]: string;
    },
    reason: patching.Reason,
  ): patching.Patcher<patching.JsonLens> {
    return (lens) => {
      const root = lens.rootPath[0];
      if (
        (root.value as unknown as types.CloudFormationRegistryResource).typeName === resource &&
        lens.jsonPointer === '/properties' &&
        lens.isJsonObject()
      ) {
        for (const [oldName, newName] of Object.entries(rename)) {
          if (lens.value[oldName]) {
            lens.renameProperty(reason.reason, oldName, newName);
          }
        }
      }
    };
  }

  /**
   * Remove a relationship from a schema section (`properties` or `definitions`).
   * The path must include `/properties` or `/definitions`.
   *
   * NOTE: returns a new patcher. Still needs to be applied to a lens.
   */
  function removeRelationshipFromSchemaSection<TypeName extends string = string>({
    section,
    resource,
    propertyPath,
    targetResource,
    targetProperty,
    reason,
  }: {
    section: 'properties' | 'definitions';
    resource: TypeName;
    propertyPath: string;
    targetResource: TypeName;
    targetProperty: string;
    reason: patching.Reason;
  }): patching.Patcher<patching.JsonLens> {
    return patchResourceAt<types.CloudFormationRegistryResource[typeof section]>(
      resource,
      propertyPath,
      reason,
      (property) => {
        if (!property) {
          return property;
        }

        const isTargetRelationship = (rel: any) =>
          'relationshipRef' in rel &&
          jsonschema.isRelationshipRef(rel.relationshipRef) &&
          rel.relationshipRef.typeName === targetResource &&
          rel.relationshipRef.propertyPath === targetProperty;

        if ('items' in property && isTargetRelationship(property.items)) {
          if (typeof property.items === 'object' && 'relationshipRef' in property.items) {
            delete (property.items as any).relationshipRef;
          }
        } else if ('anyOf' in property && Array.isArray(property.anyOf)) {
          const idx = property.anyOf.findIndex(isTargetRelationship);
          if (idx >= 0) {
            delete property.anyOf[idx];
          }
        }
        return property;
      },
    );
  }

  /**
   * Remove a relationship from a property that may have multiple relationshipRefs.
   * The `propertyPath` must include `/properties`.
   */
  export function removeRelationshipfromProperty<TypeName extends string = string>({
    resource,
    propertyPath,
    targetResource,
    targetProperty,
    reason,
  }: {
    resource: TypeName;
    propertyPath: string;
    targetResource: TypeName;
    targetProperty: string;
    reason: patching.Reason;
  }): patching.Patcher<patching.JsonLens> {
    return removeRelationshipFromSchemaSection({
      section: 'properties',
      resource,
      propertyPath,
      targetResource,
      targetProperty,
      reason,
    });
  }

  /**
   * Remove a relationship from a definition that may have multiple relationshipRefs.
   * The `propertyPath` must include `/definitions`.
   * Note, you might need to remove the relationship from the property as well
   */
  export function removeRelationshipfromDefinition<TypeName extends string = string>({
    resource,
    propertyPath,
    targetResource,
    targetProperty,
    reason,
  }: {
    resource: TypeName;
    propertyPath: string;
    targetResource: TypeName;
    targetProperty: string;
    reason: patching.Reason;
  }): patching.Patcher<patching.JsonLens> {
    return removeRelationshipFromSchemaSection({
      section: 'definitions',
      resource,
      propertyPath,
      targetResource,
      targetProperty,
      reason,
    });
  }
}
