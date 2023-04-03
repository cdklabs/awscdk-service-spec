export interface CodeGeneratorOptions {
  /**
   * How to import the core library.
   *
   * @default '@aws-cdk/core'
   */
  readonly coreImport?: string;
}

export interface AugmentationsGeneratorOptions {
  /**
   * Path of cloudwatch import to use when generating augmentation source
   * files.
   *
   * @default '@aws-cdk/aws-cloudwatch'
   */
  cloudwatchImport?: string;
}

/**
 * Configuration options for the generateAll function
 */
export interface GenerateAllOptions extends CodeGeneratorOptions, AugmentationsGeneratorOptions {
  /**
   * Path of the file containing the map of module names to their CFN Scopes
   */
  scopeMapPath: string;
}

/**
 * A data structure holding information about generated modules. It maps
 * module names to their full module definition and their CFN scopes.
 */
export interface ModuleMap {
  [moduleName: string]: {
    module?: Record<string, any>;
    scopes: string[];
    resources: Record<string, string>;
  };
}
