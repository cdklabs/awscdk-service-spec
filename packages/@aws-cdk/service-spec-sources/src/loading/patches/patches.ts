import { JsonLens } from './json-lens';
import { JsonPatch } from './json-patch';
import { SchemaLens } from './json-patcher';

type Patcher = (lens: JsonLens) => void;

export function removeAdditionalProperties(lens: JsonLens) {
  if (lens.isObject() && lens.value.type !== 'object' && lens.value.additionalProperties !== undefined) {
    lens.removeProperty('additionalProperties may only exist on object types', 'additionalProperties');
  }
}

export function replaceArrayLengthProps(lens: JsonLens) {
  if (!lens.isObject() || lens.value.type !== 'array') { return; }

  if (lens.value.minLength !== undefined) {
    lens.renameProperty('array lengths are specified using minItems, not minLength', 'minLength', 'minItems');
  }

  if (lens.value.maxLength !== undefined) {
    lens.renameProperty('array lengths are specified using maxItens, not maxLength', 'maxLength', 'maxItems');
  }
}

export function removeBooleanPatterns(lens: JsonLens) {
  if (lens.isObject() && lens.value.type === 'boolean' && lens.value.pattern !== undefined) {
    lens.removeProperty('pattern is redundant on boolean property', 'pattern');
  }
}

export function recurseAndPatch(root: any, patcher: Patcher) {
  const schema = new SchemaLens(root, { fileName: '' });
  recurse(schema);
  const patchedSchema = applyPatches(schema.patches);
  return patchedSchema;

  function recurse(lens: SchemaLens) {
    patcher(lens);

    if (Array.isArray(lens.value)) {
      lens.value.forEach((_, i) => {
        const nextLens = lens.descendArrayItems(i);
        recurse(nextLens);
        lens.reports.push(...nextLens.reports);
        lens.patches.push(...nextLens.patches);
      });
    }

    if (lens.value && typeof lens.value === 'object') {
      for (const k of Object.keys(lens.value)) {
        if (!lens.wasRemoved(k)) {
          const nextSchema = lens.descendObjectField(k);
          recurse(nextSchema);
          lens.reports.push(...nextSchema.reports);
          lens.patches.push(...nextSchema.patches);
        }
      }
    }
  }

  function applyPatches(patches: JsonPatch[]) {
    return JsonPatch.apply(root, ...patches);
  }
}
