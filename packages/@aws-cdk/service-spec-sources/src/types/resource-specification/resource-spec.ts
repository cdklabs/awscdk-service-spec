export interface ResourceSpecification {
  readonly ResourceSpecificationVersion: string;
  readonly ResourceTypes: Record<string, resourcespec.ResourceType>;
  readonly PropertyTypes: Record<string, resourcespec.PropertyType>;
}

/**
 * We don't have the tightest possible typing on this, since we only need a couple of fields.
 */
export namespace resourcespec {

  export interface ResourceType {
    readonly Documentation?: string;
    readonly Properties?: Record<string, Property>;
    readonly Attributes?: Record<string, Property>;
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

}