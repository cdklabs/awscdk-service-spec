import { Property, Resource, TypeDefinition } from '@aws-cdk/service-spec';
import { PropertySpec, Type } from '@cdklabs/typewriter';
import { TypeConverter } from './type-converter';
import { propertyNameFromCloudFormation } from '../naming/conventions';
import { deprecationMessage } from './resource-type-decider';
import { splitDocumentation } from '../split-summary';
import { cloudFormationDocLink } from '../naming/doclink';
import { PropertyMapping } from '../cloudformation-mapping';

/**
 * Decide how properties get mapped between model types, Typescript types, and CloudFormation
 */
export class TypeDefinitionDecider {
  public readonly properties = new Array<TypeDefProperty>();

  constructor(
    private readonly resource: Resource,
    private readonly typeDefinition: TypeDefinition,
    private readonly converter: TypeConverter,
  ) {
    this.convertProperties();
    this.properties.sort((p1, p2) => p1.propertySpec.name.localeCompare(p2.propertySpec.name));
  }

  private convertProperties() {
    for (const [name, prop] of Object.entries(this.resource.properties)) {
      this.handlePropertyDefault(name, prop);
    }
  }

  /**
   * Default mapping for a property
   */
  private handlePropertyDefault(cfnName: string, prop: Property) {
    const name = propertyNameFromCloudFormation(cfnName);
    const baseType = this.converter.typeFromProperty(prop);
    const type = this.converter.makeTypeResolvable(baseType);
    const optional = !prop.required;

    this.properties.push({
      propertySpec: {
        name,
        type,
        optional,
        docs: {
          ...splitDocumentation(prop.documentation),
          default: prop.defaultValue ?? undefined,
          see: cloudFormationDocLink({
            resourceType: this.resource.cloudFormationType,
            propTypeName: this.typeDefinition.name,
            propName: cfnName,
          }),
          deprecated: deprecationMessage(prop),
        },
      },
      baseType,
      cfnMapping: {
        cfnName,
        propName: name,
        baseType,
        optional,
      },
    });
  }
}

export interface TypeDefProperty {
  readonly propertySpec: PropertySpec;
  /** The type that was converted (does not have the IResolvable union) */
  readonly baseType: Type;
  readonly cfnMapping: PropertyMapping;
}
