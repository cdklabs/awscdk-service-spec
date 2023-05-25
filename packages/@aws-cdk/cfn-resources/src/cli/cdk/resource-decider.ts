import { Deprecation, Property, Resource } from '@aws-cdk/service-spec';
import { $E, $T, Expression, PropertySpec, Type, expr } from '@cdklabs/typewriter';
import { CDK_CORE } from './cdk';
import { TaggabilityStyle, resourceTaggabilityStyle } from './tagging';
import { TypeConverter } from './type-converter';
import { PropertyMapping } from '../cloudformation-mapping';
import { attributePropertyName, propertyNameFromCloudFormation } from '../naming/conventions';
import { cloudFormationDocLink } from '../naming/doclink';
import { splitDocumentation } from '../split-summary';

// Depends on https://github.com/aws/aws-cdk/pull/25610
export const HAS_25610 = false;

// This convenience typewriter builder is used all over the place
const $this = $E(expr.this_());

/**
 * Decide how properties get mapped between model types, Typescript types, and CloudFormation
 */
export class ResourceDecider {
  public static taggabilityInterfaces(resource: Resource) {
    const taggability = resourceTaggabilityStyle(resource);
    return taggability?.style === 'legacy'
      ? [CDK_CORE.ITaggable]
      : taggability?.style === 'modern' && HAS_25610
      ? [CDK_CORE.ITaggableV2]
      : [];
  }

  private readonly taggability?: TaggabilityStyle;

  public readonly propsProperties = new Array<PropsProperty>();
  public readonly classProperties = new Array<ClassProperty>();
  public readonly classAttributeProperties = new Array<ClassAttributeProperty>();

  constructor(private readonly resource: Resource, private readonly converter: TypeConverter) {
    this.taggability = resourceTaggabilityStyle(this.resource);

    this.convertProperties();
    this.convertAttributes();

    this.propsProperties.sort((p1, p2) => p1.propertySpec.name.localeCompare(p2.propertySpec.name));
    this.classProperties.sort((p1, p2) => p1.propertySpec.name.localeCompare(p2.propertySpec.name));
    this.classAttributeProperties.sort((p1, p2) => p1.propertySpec.name.localeCompare(p2.propertySpec.name));
  }

  private convertProperties() {
    for (const [name, prop] of Object.entries(this.resource.properties)) {
      if (name === this.taggability?.tagPropertyName) {
        switch (this.taggability?.style) {
          case 'legacy':
            this.handleTagPropertyLegacy(name, prop);
            continue;
          case 'modern':
            if (HAS_25610) {
              this.handleTagPropertyModern(name, prop);
              continue;
            }
            break;
        }
      }
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

    this.propsProperties.push({
      propertySpec: {
        name,
        type,
        optional,
        docs: this.defaultPropDocs(cfnName, prop),
      },
      validateRequiredInConstructor: !!prop.required,
      cfnMapping: {
        cfnName,
        propName: name,
        baseType,
        optional,
      },
    });
    this.classProperties.push({
      propertySpec: {
        name,
        type,
        optional,
        immutable: false,
        docs: this.defaultClassPropDocs(cfnName, prop),
      },
      initializer: (props: Expression) => expr.get(props, name),
      cfnValueToRender: { [name]: $this[name] },
    });
  }

  /**
   * Emit legacy taggability
   *
   * This entails:
   *
   * - A props property named after the tags-holding property that is
   *   standardized: either a built-in CDK Tag type array, or a string map
   * - A class property named 'tags' that holds a TagManager and is initialized
   *   from the tags-holding property.
   *
   * We also add a mutable L1 property called '<tagsProperty>Raw' which can be used
   * to add tags apart from the TagManager.
   */
  private handleTagPropertyLegacy(cfnName: string, prop: Property) {
    if (this.resource.cloudFormationType === 'AWS::EKS::Nodegroup') {
      debugger;
    }
    const originalName = propertyNameFromCloudFormation(cfnName);
    const rawTagsPropName = `${originalName}Raw`;

    let propsTagType;
    switch (this.taggability?.variant) {
      case 'map':
        propsTagType = Type.mapOf(Type.STRING);
        break;
      case 'standard':
        propsTagType = Type.arrayOf(CDK_CORE.CfnTag);
        break;
      default:
        propsTagType = this.converter.typeFromProperty(prop);
        break;
    }

    this.propsProperties.push({
      propertySpec: {
        name: originalName,
        type: propsTagType,
        optional: true, // Tags are never required
        docs: this.defaultPropDocs(cfnName, prop),
      },
      validateRequiredInConstructor: false, // Tags are never required
      cfnMapping: {
        cfnName,
        propName: originalName,
        baseType: propsTagType,
        optional: true,
      },
    });
    this.classProperties.push(
      {
        propertySpec: {
          // Must be called 'tags' to count as ITaggable
          name: 'tags',
          type: CDK_CORE.TagManager,
          immutable: true,
          docs: {
            summary: 'Tag Manager which manages the tags for this resource',
          },
        },
        initializer: (props: Expression) =>
          new CDK_CORE.TagManager(
            this.tagManagerVariant(),
            expr.lit(this.resource.cloudFormationType),
            HAS_25610 ? expr.UNDEFINED : $E(props)[originalName],
            expr.object({ tagPropertyName: expr.lit(originalName) }),
          ),
        cfnValueToRender: {
          [originalName]: $this.tags.renderTags(...(HAS_25610 ? [$this[rawTagsPropName]] : [])),
        },
      },
      {
        propertySpec: {
          name: rawTagsPropName,
          type: propsTagType,
          optional: true, // Tags are never required
          docs: this.defaultClassPropDocs(cfnName, prop),
        },
        initializer: (props: Expression) => $E(props)[originalName],
        cfnValueToRender: {}, // Gets rendered as part of the TagManager above
      },
    );
  }

  private handleTagPropertyModern(cfnName: string, prop: Property) {
    const originalName = propertyNameFromCloudFormation(cfnName);
    const originalType = this.converter.makeTypeResolvable(this.converter.typeFromProperty(prop));

    this.propsProperties.push({
      propertySpec: {
        name: originalName,
        type: originalType,
        optional: true, // Tags are never required
        docs: this.defaultPropDocs(cfnName, prop),
      },
      validateRequiredInConstructor: false, // Tags are never required
      cfnMapping: {
        cfnName,
        propName: originalName,
        baseType: originalType,
        optional: true,
      },
    });

    this.classProperties.push(
      {
        propertySpec: {
          // Must be called 'cdkTagManager' to count as ITaggableV2
          name: 'cdkTagManager',
          type: CDK_CORE.TagManager,
          immutable: true,
          docs: {
            summary: 'Tag Manager which manages the tags for this resource',
          },
        },
        initializer: (props: Expression) =>
          new CDK_CORE.TagManager(
            this.tagManagerVariant(),
            expr.lit(this.resource.cloudFormationType),
            HAS_25610 ? expr.UNDEFINED : $E(props)[originalName],
            expr.object({ tagPropertyName: expr.lit(originalName) }),
          ),
        cfnValueToRender: {
          [originalName]: $this.tags.renderTags(...(HAS_25610 ? [$this[originalName]] : [])),
        },
      },
      {
        propertySpec: {
          name: originalName,
          type: originalType,
          optional: true, // Tags are never required
          docs: this.defaultClassPropDocs(cfnName, prop),
        },
        initializer: (props: Expression) => $E(props)[originalName],
        cfnValueToRender: {}, // Gets rendered as part of the TagManager above
      },
    );
  }

  private convertAttributes() {
    const $ResolutionTypeHint = $T(CDK_CORE.ResolutionTypeHint);

    for (const [attrName, attr] of Object.entries(this.resource.attributes)) {
      let type: Type;
      let initializer: Expression;

      if (attr.type.type === 'string') {
        type = Type.STRING;
        initializer = CDK_CORE.tokenAsString($this.getAtt(expr.lit(attrName), $ResolutionTypeHint.STRING));
      } else if (attr.type.type === 'integer') {
        type = Type.NUMBER;
        initializer = CDK_CORE.tokenAsNumber($this.getAtt(expr.lit(attrName), $ResolutionTypeHint.NUMBER));
      } else if (attr.type.type === 'number') {
        // COMPAT: Although numbers/doubles could be represented as numbers, historically in cfn2ts they were represented as IResolvable.
        type = CDK_CORE.IResolvable;
        initializer = $this.getAtt(expr.lit(attrName), $ResolutionTypeHint.NUMBER);
      } else if (attr.type.type === 'array' && attr.type.element.type === 'string') {
        type = Type.arrayOf(Type.STRING);
        initializer = CDK_CORE.tokenAsList($this.getAtt(expr.lit(attrName), $ResolutionTypeHint.STRING_LIST));
      } else {
        // This may reference a type we need to generate, so call this function because of its side effect
        this.converter.typeFromSpecType(attr.type);
        type = CDK_CORE.IResolvable;
        initializer = $this.getAtt(expr.lit(attrName));
      }

      this.classAttributeProperties.push({
        propertySpec: {
          name: attributePropertyName(attrName),
          type,
          immutable: true,
          docs: {
            summary: attr.documentation,
            remarks: [`@cloudformationAttribute ${attrName}`].join('\n'),
          },
        },
        initializer,
      });
    }
  }

  private defaultPropDocs(cfnName: string, prop: Property) {
    return {
      ...splitDocumentation(prop.documentation),
      default: prop.defaultValue ?? undefined,
      see: cloudFormationDocLink({
        resourceType: this.resource.cloudFormationType,
        propName: cfnName,
      }),
      deprecated: deprecationMessage(prop),
    };
  }

  private defaultClassPropDocs(cfnName: string, prop: Property) {
    void cfnName;
    return {
      summary: splitDocumentation(prop.documentation).summary,
      deprecated: deprecationMessage(prop),
    };
  }

  /**
   * Translates a TagVariant to the core.TagType enum
   */
  private tagManagerVariant() {
    switch (this.taggability?.variant) {
      case 'standard':
        return CDK_CORE.TagType.STANDARD;
      case 'asg':
        return CDK_CORE.TagType.AUTOSCALING_GROUP;
      case 'map':
        return CDK_CORE.TagType.MAP;
    }

    throw new Error(`Unknown variant: ${this.resource.tagInformation?.variant}`);
  }
}

export interface PropsProperty {
  readonly propertySpec: PropertySpec;
  readonly validateRequiredInConstructor: boolean;
  readonly cfnMapping: PropertyMapping;
}

export interface ClassProperty {
  readonly propertySpec: PropertySpec;

  /** Given the name of the props value, produce the member value */
  readonly initializer: (props: Expression) => Expression;

  /**
   * Lowercase property name(s) and expression(s) to render to get this property into CFN
   *
   * We will do a separate conversion of the casing of the props object, so don't do that here.
   */
  readonly cfnValueToRender: Record<string, Expression>;
}

export interface ClassAttributeProperty {
  readonly propertySpec: PropertySpec;

  /** Produce the initializer value for the member */
  readonly initializer: Expression;
}

export function deprecationMessage(property: Property): string | undefined {
  switch (property.deprecated) {
    case Deprecation.WARN:
      return 'this property has been deprecated';
    case Deprecation.IGNORE:
      return 'this property will be ignored';
  }

  return undefined;
}
