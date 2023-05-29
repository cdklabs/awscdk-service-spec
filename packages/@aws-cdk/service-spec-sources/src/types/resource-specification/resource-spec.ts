export interface CloudFormationResourceSpecification {
  readonly ResourceSpecificationVersion: string;
  readonly ResourceTypes: Record<string, resourcespec.ResourceType>;

  /**
   * Not really valid for this to be a plain property, but it happens in practice anyway
   */
  readonly PropertyTypes: Record<string, resourcespec.PropertyType | resourcespec.Property>;
}

/**
 * SAM has defined a custom extension to the CFN resource specification
 */
export interface SAMResourceSpecification {
  readonly Globals: Record<string, unknown>;
  readonly ResourceSpecificationTransform: string;
  readonly ResourceSpecificationVersion: string;
  readonly ResourceTypes: Record<string, resourcespec.SAMResourceType>;

  /**
   * Not really valid for this to be a plain property, but it happens in practice anyway
   */
  readonly PropertyTypes: Record<string, resourcespec.SAMPropertyType | resourcespec.SAMProperty>;
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

  export interface SAMResourceType {
    readonly AdditionalProperties?: boolean;
    readonly Documentation?: string;
    readonly Properties?: Record<string, SAMProperty>;
  }

  export interface SAMPropertyType {
    readonly Documentation?: string;
    readonly Properties?: Record<string, SAMProperty>;
  }

  export interface SAMProperty extends Property {
    readonly Types?: string[];
    readonly PrimitiveTypes?: string[];
    readonly ItemTypes?: string[];
    readonly PrimitiveItemTypes?: string[];
    readonly InclusiveItemPattern?: boolean;
    readonly InclusiveItemTypes?: string[];
    readonly InclusivePrimitiveItemTypes?: string[];
  }

  export function isPropType(x: PropertyType | Property): x is PropertyType {
    return !!(x as any).Properties;
  }
}
