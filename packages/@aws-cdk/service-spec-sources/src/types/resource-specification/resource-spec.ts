/**
 * CloudFormation Resource specification
 */
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
  export interface ResourceType<P extends Property = Property, A extends Attribute = Attribute> {
    readonly AdditionalProperties?: boolean;
    readonly Documentation?: string;
    readonly Properties?: Record<string, P>;
    readonly Attributes?: Record<string, A>;
  }

  export interface PropertyType<P extends Property = Property> {
    readonly Documentation?: string;
    readonly Properties?: Record<string, P>;
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
}
