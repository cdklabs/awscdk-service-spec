import { JsonLens, JsonObjectLens, Patcher, applyPatcher } from '../src/patching';

export function patchObject(obj: any, fn: Patcher<JsonObjectLens>): any {
  const { root: patchedObj } = applyPatcher(obj, fn as Patcher<JsonLens>);
  return patchedObj;
}
