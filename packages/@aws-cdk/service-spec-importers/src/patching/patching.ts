import * as jsonpatch from 'fast-json-patch';
import { JsonArrayLens, JsonLens, JsonObjectLens, NO_MISTAKE, PatchOperation } from './json-lens';

interface SchemaLensOptions {
  readonly rootPath?: JsonLens[];
  readonly jsonPointer?: string;
  readonly fileName: string;

  readonly reportInto?: PatchReport[];
  readonly patchInto?: PatchOperation[];
}

/**
 * A patch that indicates a mistake by upstream users
 */
export interface PatchReport {
  readonly subject: any;
  readonly fileName: string;
  readonly path: string;
  readonly patch: PatchOperation;
  readonly reason: string;
}

export class SchemaLens implements JsonLens, JsonObjectLens, JsonArrayLens {
  /** Filename of the file */
  readonly fileName: string;

  /** JSON Pointer (RFC 6901) to the current value (ex. `/foo/bar/3`) */
  readonly jsonPointer: string;

  /** The path of the lenses to the current value, current lens is always in this list. */
  readonly rootPath: JsonLens[];

  /** The value currently under the lens */
  readonly value: any;

  readonly reports: PatchReport[];

  readonly patches: PatchOperation[];

  readonly removedKeys: string[] = [];

  constructor(value: any, options: SchemaLensOptions) {
    this.value = value;
    this.rootPath = options.rootPath ? [...options.rootPath, this] : [this];
    this.jsonPointer = options.jsonPointer ?? '';
    this.fileName = options.fileName;
    this.reports = options.reportInto ?? [];
    this.patches = options.patchInto ?? [];
  }

  public get hasPatches() {
    return this.patches.length > 0;
  }

  /** Type test for whether the current lens points to a json object. */
  isJsonObject(): this is JsonObjectLens {
    return typeof this.value === 'object' && this.value && !Array.isArray(this.value);
  }

  isJsonArray(): this is JsonArrayLens {
    return Array.isArray(this.value);
  }

  wasRemoved(key: string) {
    return this.removedKeys.includes(key);
  }

  /** Fully replace the current value with a different one. */
  replaceValue(reason: string, newValue: any): void {
    this.recordPatch(reason, { op: 'replace', path: this.jsonPointer, value: newValue });
  }

  /** Remove the property with the given name on the current object. The property will not be recursed into. */
  removeProperty(reason: string, name: string): void {
    if (this.isJsonObject()) {
      this.recordPatch(reason, { op: 'remove', path: `${this.jsonPointer}/${name}` });
      this.removedKeys.push(name);
    }
  }

  /** Rename a property, optionally transforming its value. */
  renameProperty(reason: string, oldName: string, newName: string, fx?: (x: any) => any): void {
    if (this.isJsonObject() && this.value[oldName]) {
      if (fx) {
        // patch to remove oldName must be added first in case oldName === newName
        this.recordPatch(reason, { op: 'remove', path: `${this.jsonPointer}/${oldName}` });
        this.recordPatch(reason, { op: 'add', path: `${this.jsonPointer}/${newName}`, value: fx(this.value[oldName]) });
      } else {
        this.recordPatch(reason, {
          op: 'move',
          from: `${this.jsonPointer}/${oldName}`,
          path: `${this.jsonPointer}/${newName}`,
        });
      }
    }
  }

  /** Add a property */
  addProperty(reason: string, name: string, value: any): void {
    if (this.isJsonObject()) {
      this.recordPatch(reason, { op: 'add', path: `${this.jsonPointer}/${name}`, value });
    }
  }

  /** Replace a property */
  replaceProperty(reason: string, name: string, value: any): void {
    if (this.isJsonObject()) {
      this.recordPatch(reason, { op: 'replace', path: `${this.jsonPointer}/${name}`, value });
    }
  }

  /** Recurse through the object field. */
  descendObjectField(key: string): SchemaLens {
    return new SchemaLens(this.value[key], {
      fileName: this.fileName,
      jsonPointer: `${this.jsonPointer}/${this.escapeKey(key)}`,
      rootPath: this.rootPath,
      reportInto: this.reports,
      patchInto: this.patches,
    });
  }

  /** Recurse through the array. */
  descendArrayElement(index: number): SchemaLens {
    return new SchemaLens(this.value[index], {
      fileName: this.fileName,
      jsonPointer: `${this.jsonPointer}/${index}`,
      rootPath: this.rootPath,
      reportInto: this.reports,
      patchInto: this.patches,
    });
  }

  recordPatch(reason: string, patch: PatchOperation) {
    this.patches.push(patch);
    this.reports.push({
      fileName: this.fileName,
      path: this.jsonPointer,
      patch,
      reason,
      subject: this.rootPath[0].value,
    });
  }

  /**
   * Escapes a segment of a key for JSON Pointer (RFC 6901).
   *
   * Rules:
   *   ~  → ~0
   *   /  → ~1
   */
  escapeKey(key: string) {
    return key.replace(/~/g, '~0').replace(/\//g, '~1');
  }
}

export type Patcher<L extends JsonLens> = (lens: L) => void;

export type JsonLensPatcher = Patcher<JsonLens>;

export type JsonObjectPatcher = Patcher<JsonObjectLens>;

export function makeCompositePatcher<L extends JsonLens>(...patchers: Patcher<L>[]): Patcher<L> {
  return (lens) => {
    for (const patcher of patchers) {
      patcher(lens);
    }
  };
}

export function onlyObjects(patcher: Patcher<JsonObjectLens>): Patcher<JsonLens> {
  return (lens) => {
    if (lens.isJsonObject()) {
      patcher(lens);
    }
  };
}

/**
 * Apply a patcher to a data structure
 */
export function applyPatcher(root: any, patcher: JsonLensPatcher) {
  // Do multiple iterations to find a fixpoint for the patching
  const patchSets = new Array<PatchReport[]>();
  let maxIterations = 10;

  while (maxIterations) {
    const schema = new SchemaLens(root, { fileName: '' });
    collectPatches(schema);

    if (!schema.hasPatches) {
      break;
    }

    const newDocument = tryApplyPatch(root, schema.patches);
    const changes = jsonpatch.compare(root, newDocument, false);
    patchSets.push(schema.reports);

    if (changes.length === 0) {
      break;
    }

    if (--maxIterations === 0) {
      throw new Error(
        [
          'Patching JSON failed to stabilize. Infinite recursion? Most recent patchsets:',
          JSON.stringify(
            patchSets.slice(-2).map((ps) =>
              ps.map((p) => ({
                reason: p.reason,
                patch: p.patch,
                subject: p.subject.value,
                path: p.path,
              })),
            ),
            undefined,
            2,
          ),
        ].join('\n'),
      );
    }

    root = newDocument;
  }

  // Only report the first iteration's patch set, it's the only one whose changes relate to the input
  // file in a meaningful way.
  const firstPatchSet: PatchReport[] = patchSets[0] ?? [];
  return { root, patches: firstPatchSet.filter((p) => p.reason !== NO_MISTAKE) };

  function collectPatches(lens: SchemaLens) {
    patcher(lens);

    if (Array.isArray(lens.value)) {
      lens.value.forEach((_, i) => {
        collectPatches(lens.descendArrayElement(i));
      });
    }

    if (lens.isJsonObject()) {
      for (const k of Object.keys(lens.value)) {
        if (!lens.wasRemoved(k)) {
          collectPatches(lens.descendObjectField(k));
        }
      }
    }
  }

  /**
   * Apply patches in order, skipping patches that don't apply due to errors
   */
  function tryApplyPatch(document: any, patch: PatchOperation[]) {
    for (const p of patch) {
      try {
        document = jsonpatch.applyOperation(document, p, false, false).newDocument;
      } catch (e) {
        // We may have produced patches that no longer cleanly apply depending on what other patches have done.
        // Catch those occurrences and give it another go on the next round.
      }
    }
    return document;
  }
}
