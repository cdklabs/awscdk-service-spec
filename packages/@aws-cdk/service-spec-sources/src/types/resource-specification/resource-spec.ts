export interface CloudFormationResourceSpecification {
  readonly ResourceSpecificationVersion: string;
  readonly ResourceTypes: Record<string, resourcespec.ResourceType>;

  /**
   * Not really valid for this to be a plain property, but it happens in practice anyway
   */
  readonly PropertyTypes: Record<string, resourcespec.PropertyType | resourcespec.Property>;
}

/**
 * We don't have the tightest possible typing on this, since we only need a couple of fields.
 */
export namespace resourcespec {
  export interface ResourceType {
    readonly AdditionalProperties?: boolean;
    readonly Documentation?: string;
    readonly Properties?: Record<string, Property>;
    readonly Attributes?: Record<string, Attribute>;
  }

  export interface PropertyType {
    readonly Documentation?: string;
    readonly Properties?: Record<string, Property>;
  }

  export interface Property {
    readonly Documentation?: string;
    readonly Required?: boolean;
    readonly Type?: string;
    readonly PrimitiveType?: string;
    readonly ItemType?: string;
    readonly PrimitiveItemType?: string;
    readonly UpdateType: 'Mutable' | 'Immutable' | 'Conditional';
    readonly DuplicatesAllowed?: boolean;
  }

  export interface Attribute {
    readonly Documentation?: string;
    readonly Required?: boolean;
    readonly Type?: string;
    readonly PrimitiveType?: string;
    readonly ItemType?: string;
    readonly PrimitiveItemType?: string;
    readonly DuplicatesAllowed?: boolean;
  }

  export function isPropType(x: PropertyType | Property): x is PropertyType {
    return !!(x as any).Properties;
  }
}
