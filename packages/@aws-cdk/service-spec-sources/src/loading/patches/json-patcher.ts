import { JsonLens, JsonObjectLens } from './json-lens';
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
  readonly subject: any;
  readonly fileName: string;
  readonly path: string;
  readonly patch: JsonPatch;
  readonly reason: string;
}

export class SchemaLens implements JsonLens, JsonObjectLens {
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
    this.rootPath = options.rootPath ?? [];
    this.jsonPath = options.jsonPath ?? '';
    this.fileName = options.fileName;
    this.reports = options.reportInto ?? [];
    this.patches = options.patchInto ?? [];

    this.rootPath.push(this);
  }

  public get hasPatches() {
    return this.patches.length > 0;
  }

  /** Type test for whether the current lens points to a json object. */
  isJsonObject(): this is JsonObjectLens {
    return typeof this.value === 'object' && this.value && !Array.isArray(this.value);
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
  renameProperty(reason: string, oldName: string, newName: string, fx: (x: any) => any = (x) => x): void {
    if (this.isJsonObject()) {
      this.recordPatch(reason, JsonPatch.add(`${this.jsonPath}/${newName}`, fx(this.value[oldName])));
      this.recordPatch(reason, JsonPatch.remove(`${this.jsonPath}/${oldName}`));
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
      this.recordPatch(reason, JsonPatch.remove(`${this.jsonPath}/${name}`));
      this.recordPatch(reason, JsonPatch.add(`${this.jsonPath}/${name}`, value));
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
      subject: this.value,
    });
  }
}
