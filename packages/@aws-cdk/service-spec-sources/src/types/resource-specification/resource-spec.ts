export interface CloudFormationResourceSpecification {
  readonly ResourceSpecificationVersion: string;
  readonly ResourceTypes: Record<string, resourcespec.ResourceType>;

  /**
   * Not really valid for this to be a plain property, but it happens in practice anyway
   */
  readonly PropertyTypes: Record<string, resourcespec.PropertyType | resourcespec.SingleTypeAlias>;
}

/**
 * SAM has defined a custom extension to the CFN resource specification
 */
export interface SAMResourceSpecification {
  readonly Globals?: Record<string, unknown>;
  readonly ResourceSpecificationTransform: string;
  readonly ResourceSpecificationVersion: string;
  readonly ResourceTypes: Record<string, resourcespec.SAMResourceType>;

  /**
   * Not really valid for this to be a plain property, but it happens in practice anyway
   */
  readonly PropertyTypes: Record<string, resourcespec.SAMPropertyType | resourcespec.SAMSingleTypeAlias>;
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

  export interface CfnTypeDefinition {
    readonly Type?: string;
    readonly PrimitiveType?: string;
    readonly ItemType?: string;
    readonly PrimitiveItemType?: string;
    readonly DuplicatesAllowed?: boolean;
  }

  export interface PropertyType extends CfnTypeDefinition {
    readonly Documentation?: string;
    readonly Properties?: Record<string, Property>;
  }

  /**
   * Used for PropertyTypes that alias a single other type (usually Json)
   */
  export interface SingleTypeAlias extends CfnTypeDefinition {
    readonly Documentation?: string;
  }

  export interface Property extends CfnTypeDefinition {
    readonly Documentation?: string;
    readonly Required?: boolean;
    readonly UpdateType: 'Mutable' | 'Immutable' | 'Conditional';
  }

  export interface Attribute extends CfnTypeDefinition {
    readonly Documentation?: string;
    readonly Required?: boolean;
  }

  export interface SAMResourceType {
    readonly AdditionalProperties?: boolean;
    readonly Documentation?: string;
    readonly Properties?: Record<string, SAMProperty>;

    // Actuaally will never have attributes but putting it here anyway is easier for regularity
    readonly Attributes?: Record<string, SAMProperty>;
  }

  export interface SAMPropertyType {
    readonly Documentation?: string;
    readonly Properties?: Record<string, SAMProperty>;
  }

  export interface SAMSingleTypeAlias extends SAMTypeDefinition {
    readonly Documentation?: string;
  }

  export interface SAMTypeDefinition extends CfnTypeDefinition {
    readonly Types?: string[];
    readonly PrimitiveTypes?: string[];
    readonly ItemTypes?: string[];
    readonly PrimitiveItemTypes?: string[];
    readonly InclusiveItemPattern?: boolean;
    readonly InclusiveItemTypes?: string[];
    readonly InclusivePrimitiveItemTypes?: string[];
  }

  export interface SAMProperty extends Property, SAMTypeDefinition {}

  export function isPropType(x: PropertyType | Property): x is PropertyType | SAMPropertyType {
    if (!x) {
      debugger;
    }
    return !!(x as any).Properties;
  }
}
