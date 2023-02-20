// A build tool to validate that our type definitions cover all resources
//
// Not a lot of thought given to where this needs to live yet.
import { promises as fs } from 'fs';
import * as path from 'path';
import * as util from 'util';
import { errorMessage, Failure, failure, Result } from '@cdklabs/tskb';
import Ajv from 'ajv';
import * as _glob from 'glob';
import { recurseAndPatch, allPatchers } from './patches/patches';


export class Loader<A> {
  public static async fromSchemaFile<A>(fileName: string, validation=SchemaValidation.FAIL): Promise<Loader<A>> {
    const ajv = new Ajv({ verbose: true });
    const cfnSchemaJson = JSON.parse(await fs.readFile(path.join(__dirname, `../../schemas/${fileName}`), { encoding: 'utf-8' }));
    const validator = ajv.compile(cfnSchemaJson);
    return new Loader(validator, validation);
  }

  public readonly failures: Failure[] = [];

  private constructor(private readonly validator: Ajv.ValidateFunction, private readonly validation: SchemaValidation) {
  }

  public async load(obj: unknown): Promise<Result<A>> {
    const patchedObj = recurseAndPatch(obj, allPatchers);
    const valid = await this.validator(patchedObj);

    const failures = [];

    if (this.validation !== SchemaValidation.NONE && !valid) {
      failures.push(...wrapErrors(this.validator.errors));
    }
    this.failures.push(...failures);

    if (this.validation !== SchemaValidation.FAIL || valid) {
      return obj as A;
    }

    return failure(`${failures.length} validation errors:\n${failures.map(x => `- ${errorMessage(x)}`).join('\n')}`);
  }

  public async loadFile(fileName: string): Promise<Result<A>> {
    return this.load(JSON.parse(await fs.readFile(fileName, { encoding: 'utf-8' })));
  }

  public async loadFiles(fileNames: string[]): Promise<Array<Result<A>>> {
    const ret = [];
    for (const x of fileNames) {
      ret.push(await this.loadFile(x));
    }
    return ret;
  }
}

export enum SchemaValidation {
  NONE,
  WARN,
  FAIL,
}

function wrapErrors(errors: Ajv.ErrorObject[] | null | undefined) {
  return errors?.map(x => failure(util.inspect(x, { depth: 3 }))) ?? [];
}
