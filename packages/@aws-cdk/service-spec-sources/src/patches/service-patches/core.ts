import { JsonObjectPatcher, isRoot } from '../../loading/patching';
import { CloudFormationRegistryResource, jsonschema } from '../../types';

export const SERVICE_PATCHERS: Array<JsonObjectPatcher> = [];

/**
 * Register an unnamed exception patcher
 */
export function registerServicePatch(patcher: JsonObjectPatcher) {
  SERVICE_PATCHERS.push(patcher);
}

/**
 * Only call the inner patcher if we are inside the given resource type
 *
 * It will still be invoked at every JSON node in that document.
 */
export function forResource(resource: string, patcher: JsonObjectPatcher): JsonObjectPatcher {
  return (lens) => {
    const root = lens.rootPath[0];
    if (root.isJsonObject() && (root.value as unknown as CloudFormationRegistryResource).typeName === resource) {
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

export class Reason {
  public static backwardsCompat() {
    return new Reason('Backwards compatibility');
  }

  public static other(reason: string) {
    return new Reason(reason);
  }

  private constructor(public readonly reason: string) {}
}
