import { patching, types } from '@aws-cdk/service-spec-importers';

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
 * Drop the old definition, and rename the new definition to have the same old name to keep backward compatability
 *
 * NOTE: returns a new patcher. Still needs to be applied to a lens.
 */
export function replaceExitingDefinitionWithNewOne(
  oldDefinitionName: string,
  newDefinitionName: string,
  reason: patching.Reason,
): patching.JsonObjectPatcher {
  return (lens) => {
    if (lens.jsonPointer === `/definitions`) {
      // remove the old definition
      lens.removeProperty(reason.reason, oldDefinitionName);
      // rename the new definition to be named as the old one
      lens.renameProperty(reason.reason, newDefinitionName, oldDefinitionName);
    }
    if (lens.value.$ref === `#/definitions/${newDefinitionName}`) {
      lens.recordPatch(reason.reason, {
        op: 'replace',
        path: lens.jsonPointer,
        value: {
          ...lens.value,
          $ref: `#/definitions/${oldDefinitionName}`,
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
}
