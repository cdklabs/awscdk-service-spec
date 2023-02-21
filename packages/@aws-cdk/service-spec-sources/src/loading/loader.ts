// A build tool to validate that our type definitions cover all resources
//
// Not a lot of thought given to where this needs to live yet.
import { promises as fs } from 'fs';
import * as path from 'path';
import * as util from 'util';
import { failure, Failure, isFailure, isSuccess, locateFailure, Result } from '@cdklabs/tskb';
import Ajv from 'ajv';
import * as _glob from 'glob';
import { recurseAndPatch, allPatchers } from './patches/patches';

export class Loader<A> {
  public static async fromSchemaFile<A>(fileName: string, mustValidate: boolean): Promise<Loader<A>> {
    const ajv = new Ajv({ verbose: true });
    const cfnSchemaJson = JSON.parse(
      await fs.readFile(path.join(__dirname, `../../schemas/${fileName}`), { encoding: 'utf-8' }),
    );
    const validator = ajv.compile(cfnSchemaJson);
    return new Loader(validator, mustValidate);
  }

  private constructor(private readonly validator: Ajv.ValidateFunction, private readonly mustValidate: boolean) {}

  /**
   * Validate the given object
   *
   * - Returns success if validation is NONE or WARNING.
   * - Adds warnings to the Loader object if validation is WARNING.
   */
  public async load(obj: unknown): Promise<Result<LoadResult<A>>> {
    const patchedObj = recurseAndPatch(obj, allPatchers);
    const valid = await this.validator(patchedObj);

    if (this.mustValidate && !valid) {
      return failureFromErrors(this.validator.errors);
    }

    return {
      value: obj as any,
      warnings: failuresFromErrors(this.validator.errors),
    };
  }

  /**
   * Validate the given file
   *
   * - Returns success if validation is NONE or WARNING.
   * - Adds warnings to the Loader object if validation is WARNING.
   */
  public async loadFile(fileName: string): Promise<Result<LoadResult<A>>> {
    return prefixResult(fileName, await this.load(JSON.parse(await fs.readFile(fileName, { encoding: 'utf-8' }))));
  }

  /**
   * Validate the given files
   *
   * Returns only successfully parsed objects.
   */
  public async loadFiles(fileNames: string[]): Promise<LoadResult<A[]>> {
    return combineLoadResults(await seqMap(fileNames, async (fileName) => this.loadFile(fileName)));
  }
}

function failureFromErrors(errors: Ajv.ErrorObject[] | null | undefined): Failure {
  return failure((errors?.map((x) => util.inspect(x, { depth: 3 })) ?? []).join('\n'));
}

function failuresFromErrors(errors: Ajv.ErrorObject[] | null | undefined): Failure[] {
  return (errors ?? []).map((x) => failure(util.inspect(x, { depth: 3 })));
}

/**
 * Sequantial map for async functions
 *
 * (In case we're concerned about the performance implications of `Promise.all()`.)
 */
async function seqMap<A, B>(xs: A[], fn: (x: A) => Promise<B>): Promise<B[]> {
  const ret: B[] = [];
  for (const x of xs) {
    ret.push(await fn(x));
  }
  return ret;
}

export interface LoadResult<A> {
  readonly value: A;
  readonly warnings: Failure[];
}

function prefixResult<A>(prefix: string, x: Result<LoadResult<A>>): Result<LoadResult<A>> {
  if (isFailure(x)) {
    return locateFailure(prefix)(x);
  }

  return {
    value: x.value,
    warnings: x.warnings.map(locateFailure(prefix)),
  };
}

export function combineLoadResults<A>(xs: Result<LoadResult<A>>[]): LoadResult<A[]> {
  const ret: LoadResult<A[]> = { value: [], warnings: [] };

  return xs.reduce((rs, r) => {
    if (isSuccess(r)) {
      rs.value.push(r.value);
      rs.warnings.push(...r.warnings);
    } else {
      rs.warnings.push(r);
    }
    return rs;
  }, ret);
}
