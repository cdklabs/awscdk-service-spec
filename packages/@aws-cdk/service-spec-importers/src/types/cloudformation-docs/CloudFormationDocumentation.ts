export interface CloudFormationDocumentation {
  /**
   * Mapping type name to type documentation
   *
   * Name will be either:
   *
   * - `AWS::Service::Resource`
   * - `AWS::Service::Resource.PropertyType`
   */
  readonly Types: Record<string, cfndocs.TypeDocumentation>;
}

export namespace cfndocs {
  export interface TypeDocumentation {
    readonly description?: string;
    readonly attributes?: Record<string, string>;
    readonly properties?: Record<string, string>;
  }
}
