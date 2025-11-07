import * as jsonpatch from 'fast-json-patch';

/** Reason constants */
export const NO_MISTAKE = 'no-mistake';

/** We only support these patch operations */
export type PatchOperation =
  | jsonpatch.AddOperation<any>
  | jsonpatch.RemoveOperation
  | jsonpatch.ReplaceOperation<any>
  | jsonpatch.MoveOperation
  | jsonpatch.CopyOperation;

/**
 * A lens that points to a location in a JSON data structure
 */
export interface JsonLens {
  /** Filename of the file */
  readonly fileName: string;

  /**
   * JSON Pointer (RFC 6901) to the current value
   *
   * Likes like:
   *
   * - ''
   * - '/value'
   * - '/obj/subproperty'
   * - '/array/5'
   */
  readonly jsonPointer: string;

  /** The path of the lenses to the current value, current lens is always in this list. */
  readonly rootPath: JsonLens[];

  /** The value currently under the lens */
  readonly value: unknown;

  /** Type test for whether the current lens points to an object. */
  isJsonObject(): this is JsonObjectLens;

  /** Type test for whether the current lens points to an array. */
  isJsonArray(): this is JsonArrayLens;

  /** Fully replace the current value with a different one. */
  replaceValue(reason: string, newValue: any): void;

  /** Record a raw patch operation. */
  recordPatch(reason: string, patch: PatchOperation): void;

  /** Escape a segment of a key for JSON Pointer. */
  escapeKey(key: string): string;
}

export interface JsonObjectLens extends JsonLens {
  readonly value: Record<string, unknown>;

  /** Remove the property with the given name on the current object. The property will not be recursed into. */
  removeProperty(reason: string, name: string): void;

  /** Rename a property, optionally transforming its value. */
  renameProperty(reason: string, oldName: string, newName: string, fx?: (x: any) => any): void;

  /** Add a property */
  addProperty(reason: string, name: string, value: any): void;

  /** Replace a property */
  replaceProperty(reason: string, name: string, value: any): void;

  /** Recurse through the object field. */
  descendObjectField(key: string): JsonLens;
}

export interface JsonArrayLens extends JsonLens {
  readonly value: unknown[];

  /** Recurse through the object field. */
  descendArrayElement(index: number): JsonLens;
}

export function isRoot(lens: JsonLens) {
  return lens.rootPath.length === 1;
}
