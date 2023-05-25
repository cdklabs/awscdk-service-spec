import { Entity, Relationship } from '@cdklabs/tskb';
import { Resource } from './resource';

export type HasLegacyTag = Relationship<Resource, LegacyTagProperty>;

/**
 * Used to record what properties are marked with type 'Tag' in the old spec
 *
 * In the old codegen, the intrinsic 'Tag' type is not represented or
 * representable, but we used to generate different code from it previously
 * so we need that information in order to present equivalent codegen.
 */
export interface LegacyTagProperty extends Entity {
  /**
   * The name of the property that has the 'Tag[]' type
   */
  readonly propertyName: string;
}
