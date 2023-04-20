import { JsonLens, JsonLensPatcher, JsonObjectPatcher, Patcher, Reason, fp as fun, isRoot } from '../../patching';
import { CloudFormationRegistryResource, jsonschema } from '../../types';

export const SERVICE_PATCHERS: Array<JsonLensPatcher> = [];

/**
 * Register an unnamed exception patcher
 */
export function registerServicePatch(patcher: JsonLensPatcher) {
  SERVICE_PATCHERS.push(patcher);
}

/**
 * Only call the inner patcher if we are inside the given resource type
 *
 * It will still be invoked at every JSON node in that document.
 */
export function forResource(resource: string, patcher: JsonObjectPatcher): JsonLensPatcher {
  return (lens) => {
    const root = lens.rootPath[0];
    if (
      lens.isJsonObject() &&
      root.isJsonObject() &&
      (root.value as unknown as CloudFormationRegistryResource).typeName === resource
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
  newSchema: jsonschema.Schema,
  reason: Reason,
): JsonObjectPatcher {
  return (lens) => {
    if (lens.jsonPointer === `/properties/${propertyName}`) {
      lens.replaceValue(reason.reason, newSchema);
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
  newSchema: jsonschema.Schema,
  reason: Reason,
): JsonObjectPatcher {
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
export function renameDefinition(oldName: string, newName: string, reason: Reason): JsonObjectPatcher {
  return (lens) => {
    if (lens.jsonPointer === `/definitions`) {
      lens.renameProperty(reason.reason, oldName, newName);
    }
  };
}

/**
 * Add a definition, only if the definition doesn't yet exist
 *
 * NOTE: returns a new patcher. Still needs to be applied to a lens.
 */
export function addDefinitions(definitions: Record<string, jsonschema.Schema>, reason: Reason): JsonObjectPatcher {
  return (lens) => {
    if (isRoot(lens) && lens.value.definitions === undefined) {
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
    reason: Reason,
    patch: fun.Patch<Tree>,
  ): Patcher<JsonLens> {
    return (lens) => {
      const root = lens.rootPath[0];
      if ((root.value as unknown as CloudFormationRegistryResource).typeName === resource) {
        fun.patchAt(pointer, reason, patch)(lens);
      }
    };
  }

  /**
   * Patch a resource at the root
   */
  export function patchResource<
    Tree extends CloudFormationRegistryResource & {
      typeName: TypeName;
    },
    TypeName extends string = string,
  >(resource: TypeName, reason: Reason, patch: fun.Patch<Tree>): Patcher<JsonLens> {
    return patchResourceAt(resource, '', reason, patch);
  }
}
