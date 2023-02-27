import { JsonArrayLens, JsonLens, JsonObjectLens, NO_MISTAKE } from './json-lens';
import { JsonPatch } from './json-patch';

interface SchemaLensOptions {
  readonly rootPath?: JsonLens[];
  readonly jsonPath?: string;
  readonly fileName: string;

  readonly reportInto?: PatchReport[];
  readonly patchInto?: JsonPatch[];
}

/**
 * A patch that indicates a mistake by upstream users
 */
export interface PatchReport {
  readonly subject: SchemaLens;
  readonly fileName: string;
  readonly path: string;
  readonly patch: JsonPatch;
  readonly reason: string;
}

export class SchemaLens implements JsonLens, JsonObjectLens, JsonArrayLens {
  /** Filename of the file */
  readonly fileName: string;

  /** JSON Path to the current value (ex. `/foo/bar/3`) */
  readonly jsonPath: string;

  /** The path of the lenses to the current value, current lens is always in this list. */
  readonly rootPath: JsonLens[];

  /** The value currently under the lens */
  readonly value: any;

  readonly reports: PatchReport[];

  readonly patches: JsonPatch[];

  readonly removedKeys: string[] = [];

  constructor(value: any, options: SchemaLensOptions) {
    this.value = value;
    this.rootPath = options.rootPath ? [...options.rootPath, this] : [this];
    this.jsonPath = options.jsonPath ?? '';
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
    this.recordPatch(reason, JsonPatch.replace(this.jsonPath, newValue));
  }

  /** Remove the property with the given name on the current object. The property will not be recursed into. */
  removeProperty(reason: string, name: string): void {
    if (this.isJsonObject()) {
      this.recordPatch(reason, JsonPatch.remove(`${this.jsonPath}/${name}`));
      this.removedKeys.push(name);
    }
  }

  /** Rename a property, optionally transforming its value. */
  renameProperty(reason: string, oldName: string, newName: string, fx?: (x: any) => any): void {
    if (this.isJsonObject()) {
      if (fx) {
        this.recordPatch(reason, JsonPatch.add(`${this.jsonPath}/${newName}`, fx(this.value[oldName])));
        this.recordPatch(reason, JsonPatch.remove(`${this.jsonPath}/${oldName}`));
      } else {
        this.recordPatch(reason, JsonPatch.move(`${this.jsonPath}/${oldName}`, `${this.jsonPath}/${newName}`));
      }
    }
  }

  /** Add a property */
  addProperty(reason: string, name: string, value: any): void {
    if (this.isJsonObject()) {
      this.recordPatch(reason, JsonPatch.add(`${this.jsonPath}/${name}`, value));
    }
  }

  /** Replace a property */
  replaceProperty(reason: string, name: string, value: any): void {
    if (this.isJsonObject()) {
      this.recordPatch(reason, JsonPatch.replace(`${this.jsonPath}/${name}`, value));
    }
  }

  /** Recurse through the object field. */
  descendObjectField(key: string): SchemaLens {
    return new SchemaLens(this.value[key], {
      fileName: this.fileName,
      jsonPath: `${this.jsonPath}/${key}`,
      rootPath: this.rootPath,
      reportInto: this.reports,
      patchInto: this.patches,
    });
  }

  /** Recurse through the array. */
  descendArrayElement(index: number): SchemaLens {
    return new SchemaLens(this.value[index], {
      fileName: this.fileName,
      jsonPath: `${this.jsonPath}/${index}`,
      rootPath: this.rootPath,
      reportInto: this.reports,
      patchInto: this.patches,
    });
  }

  private recordPatch(reason: string, patch: JsonPatch) {
    this.patches.push(patch);
    this.reports.push({
      fileName: this.fileName,
      path: this.jsonPath,
      patch,
      reason,
      subject: this,
    });
  }
}

export type Patcher<L extends JsonLens> = (lens: L) => void;

export type JsonLensPatcher = Patcher<JsonLens>;

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
    recurse(schema);
    if (!schema.hasPatches) {
      break;
    }
    patchSets.push(schema.reports);

    if (--maxIterations === 0) {
      throw new Error(
        [
          'Patching JSON failed to stabilize. Infinite recursion? Most recent patchsets:',
          JSON.stringify(patchSets.slice(-2), undefined, 2),
        ].join('\n'),
      );
    }
    try {
      root = applyPatches(schema.patches);
    } catch (e) {
      // We may have produced patches that no longer cleanly apply depending on what other patches have done.
      // Catch those occurrences and give it another go on the next round.
    }
  }

  // Only report the first iteration's patch set, it's the only one whose changes relate to the input
  // file in a meaningful way.
  const firstPatchSet: PatchReport[] = patchSets[0] ?? [];
  return { root, patches: firstPatchSet.filter((p) => p.reason !== NO_MISTAKE) };

  function recurse(lens: SchemaLens) {
    patcher(lens);

    if (Array.isArray(lens.value)) {
      lens.value.forEach((_, i) => {
        recurse(lens.descendArrayElement(i));
      });
    }

    if (lens.isJsonObject()) {
      for (const k of Object.keys(lens.value)) {
        if (!lens.wasRemoved(k)) {
          recurse(lens.descendObjectField(k));
        }
      }
    }
  }

  function applyPatches(patches: JsonPatch[]) {
    return JsonPatch.apply(root, ...patches);
  }
}
