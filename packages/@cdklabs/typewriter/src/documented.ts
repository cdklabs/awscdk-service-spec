/**
 * API Stability levels. These are modeled after the `node` stability index.
 *
 * @see https://nodejs.org/api/documentation.html#documentation_stability_index.
 */
export enum Stability {
  /**
   * The API may emit warnings. Backward compatibility is not guaranteed.
   *
   * More information about the deprecation can usually be found in the
   * `deprecated` field.
   */
  Deprecated = 'deprecated',
  /**
   * This API is still under active development and subject to non-backward
   * compatible changes or removal in any future version. Use of the API is
   * not recommended in production environments. Experimental APIs are not
   * subject to the Semantic Versioning model.
   */
  Experimental = 'experimental',
  /**
   * This API is subject to the Semantic Versioning model and may not change
   * in breaking ways in a subsequent minor or patch version.
   */
  Stable = 'stable',
  /**
   * This API is an representation of an API managed elsewhere and follows
   * the other API's versioning model.
   */
  External = 'external',
}

export interface DocsSpec {
  /**
   * Summary documentation for an API item.
   *
   * The first part of the documentation before hitting a `@remarks` tags, or
   * the first line of the doc comment block if there is no `@remarks` tag.
   *
   * @default none
   */
  summary?: string;
  /**
   * Detailed information about an API item.
   *
   * Either the explicitly tagged `@remarks` section, otherwise everything
   * past the first paragraph if there is no `@remarks` tag.
   *
   * @default none
   */
  remarks?: string;
  /**
   * If present, this block indicates that an API item is no longer supported
   * and may be removed in a future release.  The `@deprecated` tag must be
   * followed by a sentence describing the recommended alternative.
   * Deprecation recursively applies to members of a container. For example,
   * if a class is deprecated, then so are all of its members.
   *
   * @default none
   */
  deprecated?: string;
  /**
   * The `@returns` block for this doc comment, or undefined if there is not
   * one.
   *
   * @default none
   */
  returns?: string;
  /**
   * Whether the API item is beta/experimental quality
   */
  stability?: Stability;
  /**
   * Example showing the usage of this API item
   *
   * Starts off in running text mode, may switch to code using fenced code
   * blocks.
   *
   * @default none
   */
  example?: string;
  /**
   * A `@see` link with more information
   *
   * @default none
   */
  see?: string;
  /**
   * Description of the default
   *
   * @default none
   */
  default?: string;
}

export interface Documented {
  readonly docs?: DocsSpec;
}
