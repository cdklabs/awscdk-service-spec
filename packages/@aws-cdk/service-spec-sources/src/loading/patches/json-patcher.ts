import { JsonLens, JsonObjectLens } from './json-lens';
import { JsonPatch } from './json-patch';

interface SchemaLensOptions {
  readonly rootPath?: JsonLens[];
  readonly jsonPath?: string;
  readonly fileName: string;
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

  readonly reports: string[] = [];

  readonly patches: JsonPatch[] = [];

  readonly removedKeys: string[] = [];

  constructor(value: any, options: SchemaLensOptions) {
    this.value = value;
    this.rootPath = options.rootPath ?? [];
    this.jsonPath = options.jsonPath ?? '';
    this.fileName = options.fileName;

    this.rootPath.push(this);
  }

  /** Type test for whether the current lens points to a json object. */
  isJsonObject(): this is JsonObjectLens {
    return typeof this.value === 'object' && this.value && this.value.type !== undefined;
  };

  wasRemoved(key: any) {
    return this.removedKeys.includes(key);
  }

  /** Fully replace the current value with a different one. */
  replaceValue(reason: string, newValue: any): void {
    this.reports.push(reason);
    this.patches.push(JsonPatch.replace(this.jsonPath, newValue));
  }

  /** Remove the property with the given name on the current object. The property will not be recursed into. */
  removeProperty(reason: string, name: string): void {
    if (this.isJsonObject()) {
      this.reports.push(reason);
      this.removedKeys.push(name);
      this.patches.push(JsonPatch.remove(`${this.jsonPath}/${name}`));
    }
  }

  /** Rename a property, optionally transforming its value. */
  renameProperty(reason: string, oldName: string, newName: string, fx: (x: any) => any = (x) => x): void {
    if (this.isJsonObject()) {
      this.reports.push(reason);
      this.patches.push(JsonPatch.add(`${this.jsonPath}/${newName}`, fx(this.value[oldName])));
      this.patches.push(JsonPatch.remove(`${this.jsonPath}/${oldName}`));
    }
  }

  /** Add a property */
  addProperty(reason: string, name: string, value: any): void {
    if (this.isJsonObject()) {
      this.reports.push(reason);
      this.patches.push(JsonPatch.add(`${this.jsonPath}/${name}`, value));
    }
  }

  /** Recurse through the object field. */
  descendObjectField(key: string): SchemaLens {
    const newSchema = new SchemaLens(this.value[key], {
      fileName: this.fileName,
      jsonPath: `${this.jsonPath}/${key}`,
      rootPath: this.rootPath,
    });
    return newSchema;
  }

  /** Recurse through the array. */
  descendArrayElement(index: number): SchemaLens {
    const newSchema = new SchemaLens(this.value[index], {
      fileName: this.fileName,
      jsonPath: `${this.jsonPath}/${index}`,
      rootPath: this.rootPath,
    });
    return newSchema;
  };
}
