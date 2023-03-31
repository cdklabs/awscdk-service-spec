import { resourcespec } from '../resource-specification/resource-spec';

/**
 * SAM resource specification
 *
 * It's a lot like the CloudFormation resource specification, but different.
 */
export interface SamResourceSpecification {
  readonly ResourceSpecificationVersion: string;
  readonly ResourceSpecificationTransform: string;

  /**
   * Don't care about these currently
   */
  readonly Globals: Record<string, unknown>;

  readonly ResourceTypes: Record<string, resourcespec.ResourceType>;

  /**
   * Not really valid for this to be a plain property, but it happens in practice anyway
   */
  readonly PropertyTypes: Record<string, resourcespec.PropertyType | resourcespec.Property>;
}

export namespace samspec {
  export interface Property extends resourcespec.Property {
    readonly Types?: string[];
    readonly PrimitiveTypes?: string[];
    readonly ItemTypes?: string[];
    readonly PrimitiveItemTypes?: string[];
    readonly InclusivePrimitiveItemTypes?: string[];
    readonly InclusiveItemTypes?: string[];
  }
}
