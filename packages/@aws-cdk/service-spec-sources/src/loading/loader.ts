// A build tool to validate that our type definitions cover all resources
//
// Not a lot of thought given to where this needs to live yet.
import { promises as fs } from 'fs';
import * as path from 'path';
import * as util from 'util';
import { failure, Failure, isFailure, isSuccess, locateFailure, Result } from '@cdklabs/tskb';
import Ajv from 'ajv';
import * as _glob from 'glob';
import { applyPatcher, JsonLensPatcher, PatchReport } from './patches/patching';

export interface LoadOptions {
  /**
   * Fail if we detect schema validations with the data source
   *
   * @default true
   */
  readonly mustValidate?: boolean;

  /**
   * Patches to apply to the data before it is validated
   */
  readonly patcher?: JsonLensPatcher;

  /**
   * If present, make filenames in errors relative to this directory
   */
  readonly errorRootDirectory?: string;
}

export class Loader<A> {
  public static async fromSchemaFile<A>(fileName: string, options: LoadOptions): Promise<Loader<A>> {
    const ajv = new Ajv({ verbose: true });
    const cfnSchemaJson = JSON.parse(
      await fs.readFile(path.join(__dirname, `../../schemas/${fileName}`), { encoding: 'utf-8' }),
    );
    const validator = ajv.compile(cfnSchemaJson);
    return new Loader(validator, options);
  }

  private constructor(private readonly validator: Ajv.ValidateFunction, private readonly options: LoadOptions) {}

  /**
   * Validate the given object
   *
   * - Returns success if validation is NONE or WARNING.
   * - Adds warnings to the Loader object if validation is WARNING.
   */
  public async load(obj: unknown): Promise<Result<LoadResult<A>>> {
    const patchesApplied = new Array<PatchReport>();

    if (this.options.patcher) {
      const patchResult = applyPatcher(obj, this.options.patcher);
      obj = patchResult.root;
      patchesApplied.push(...patchResult.patches);
    }
    const valid = await this.validator(obj);

    if ((this.options.mustValidate ?? true) && !valid) {
      return failureFromErrors(this.validator.errors);
    }

    return {
      value: obj as any,
      patchesApplied,
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
    return this.annotateWithFilename(
      fileName,
      await this.load(JSON.parse(await fs.readFile(fileName, { encoding: 'utf-8' }))),
    );
  }

  /**
   * Validate the given files
   *
   * Returns only successfully parsed objects.
   */
  public async loadFiles(fileNames: string[]): Promise<LoadResult<A[]>> {
    return combineLoadResults(await seqMap(fileNames, async (fileName) => this.loadFile(fileName)));
  }

  private annotateWithFilename<B>(fileName: string, x: Result<LoadResult<B>>): Result<LoadResult<B>> {
    if (this.options.errorRootDirectory !== undefined) {
      fileName = path.relative(this.options.errorRootDirectory, fileName);
    }

    if (isFailure(x)) {
      return locateFailure(fileName)(x);
    }

    return {
      value: x.value,
      patchesApplied: x.patchesApplied.map((p) => ({ ...p, fileName })),
      warnings: x.warnings.map(locateFailure(fileName)),
    };
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
  /**
   * The value that was loaded
   */
  readonly value: A;

  /**
   * Schema errors reported by the schema checker
   */
  readonly warnings: Failure[];

  /**
   * Patches that were applied by the patcher (if any)
   */
  readonly patchesApplied: PatchReport[];
}

export function combineLoadResults<A>(xs: Result<LoadResult<A>>[]): LoadResult<A[]> {
  const ret: LoadResult<A[]> = { value: [], warnings: [], patchesApplied: [] };

  return xs.reduce((rs, r) => {
    if (isSuccess(r)) {
      rs.value.push(r.value);
      rs.warnings.push(...r.warnings);
      rs.patchesApplied.push(...r.patchesApplied);
    } else {
      rs.warnings.push(r);
    }
    return rs;
  }, ret);
}
