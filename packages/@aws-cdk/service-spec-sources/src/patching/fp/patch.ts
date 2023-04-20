import * as jsonpatch from 'fast-json-patch';
import { JsonLens, PatchOperation } from '../json-lens';
import { Patcher } from '../patching';
import { Reason } from '../reason';

export type Mutable<T> = { -readonly [P in keyof T]: T[P] };
export type Patch<Tree extends any> = (doc: Mutable<Tree>) => Tree;

/**
 * Patch a document at a JSON Pointer location
 */
export function patchAt<Tree extends any>(pointer: string, reason: Reason, patch: Patch<Tree>): Patcher<JsonLens> {
  return (lens) => {
    const root = lens.rootPath[0];
    if (
      lens.jsonPointer === pointer &&
      (lens.isJsonObject() || lens.isJsonArray()) &&
      (root.isJsonObject() || root.isJsonArray())
    ) {
      const mutableDoc = jsonpatch.deepClone(root.value);
      patch(jsonpatch.getValueByPointer(mutableDoc, lens.jsonPointer));
      const changes = jsonpatch.compare(root.value, mutableDoc, false) as PatchOperation[];

      for (const change of changes) {
        lens.recordPatch(reason.reason, change);
      }
    }
  };
}

/**
 * Patch a document at the root
 */
export function patchDocument<Document extends any>(reason: Reason, patch: Patch<Document>): Patcher<JsonLens> {
  return patchAt('', reason, patch);
}
