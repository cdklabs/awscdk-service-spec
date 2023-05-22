import { Attribute, PropertyType, Resource } from '@aws-cdk/service-spec';
import {
  $E,
  $T,
  Block,
  ClassType,
  expr,
  Expression,
  MemberVisibility,
  IScope,
  stmt,
  StructType,
  SuperInitializer,
  TruthyOr,
  Type,
  Initializer,
  IsNotNullish,
  AnonymousInterfaceImplementation,
  Lambda,
  Stability,
  ObjectLiteral,
  Property,
} from '@cdklabs/typewriter';
import { CDK_CORE, CONSTRUCTS } from './cdk';
import { TaggabilityStyle, resourceTaggabilityStyle } from './tagging';
import {
  attributePropertyName,
  classNameFromResource,
  cfnParserNameFromType,
  staticResourceTypeName,
  cfnProducerNameFromType,
  propertyNameFromCloudFormation,
} from '../naming/conventions';
import { cloudFormationDocLink } from '../naming/doclink';
import { splitDocumentation } from '../split-summary';

export interface ITypeHost {
  typeFromSpecType(type: PropertyType): Type;
}

export interface ResourceClassSpec {
  propsType: StructType;
}

// Depends on https://github.com/aws/aws-cdk/pull/25610
const HAS_25610 = false;

// This convenience typewriter builder is used all over the place
const $this = $E(expr.this_());

export class ResourceClass extends ClassType {
  private _propsType?: StructType;
  private readonly taggability?: TaggabilityStyle;

  constructor(scope: IScope, private readonly res: Resource, suffix?: string) {
    const taggability = resourceTaggabilityStyle(res);

    const taggabilityInterface =
      taggability?.style === 'legacy'
        ? [CDK_CORE.ITaggable]
        : taggability?.style === 'modern' && HAS_25610
        ? [CDK_CORE.ITaggable2]
        : [];

    super(scope, {
      export: true,
      name: classNameFromResource(res, suffix),
      docs: {
        ...splitDocumentation(res.documentation),
        stability: Stability.External,
        see: cloudFormationDocLink({
          resourceType: res.cloudFormationType,
        }),
      },
      extends: CDK_CORE.CfnResource,
      implements: [CDK_CORE.IInspectable, ...taggabilityInterface],
    });

    this.taggability = taggability;
  }

  private get propsType(): StructType {
    if (!this._propsType) {
      throw new Error('_propsType must be set before calling this method');
    }
    return this._propsType;
  }

  public buildMembers(propsType: StructType) {
    this._propsType = propsType;

    this.addProperty({
      name: staticResourceTypeName(),
      immutable: true,
      static: true,
      type: Type.STRING,
      initializer: expr.lit(this.res.cloudFormationType),
      docs: {
        summary: 'The CloudFormation resource type name for this resource class.',
      },
    });

    this.addFromCloudFormationFactory(propsType);

    // Attributes
    for (const { attrName, name, type, attr } of this.mappableAttributes()) {
      this.addProperty({
        name,
        type,
        immutable: true,
        docs: {
          summary: attr.documentation,
          remarks: [`@cloudformationAttribute ${attrName}`].join('\n'),
        },
      });
    }

    // Copy properties onto class properties
    for (const { name, memberOptional, memberType, memberImmutable, docsSummary } of this.mappableProperties()) {
      this.addProperty({
        name: name,
        type: memberType,
        optional: memberOptional,
        immutable: memberImmutable,
        docs: {
          summary: docsSummary,
        },
      });
    }

    this.makeConstructor();
    this.makeInspectMethod();
    this.makeCfnProperties();
    this.makeRenderProperties();
  }

  private addFromCloudFormationFactory(propsType: StructType) {
    const factory = this.addMethod({
      name: '_fromCloudFormation',
      static: true,
      returnType: this.type,
      docs: {
        summary: `Build a ${this.name} from CloudFormation properties`,
        remarks: [
          'A factory method that creates a new instance of this class from an object',
          'containing the CloudFormation properties of this resource.',
          'Used in the @aws-cdk/cloudformation-include module.',
          '',
          '@internal',
        ].join('\n'),
      },
    });

    const scope = factory.addParameter({ name: 'scope', type: CONSTRUCTS.Construct });
    const id = factory.addParameter({ name: 'id', type: Type.STRING });
    const resourceAttributes = $E(factory.addParameter({ name: 'resourceAttributes', type: Type.ANY }));
    const options = $E(
      factory.addParameter({
        name: 'options',
        type: CDK_CORE.helpers.FromCloudFormationOptions,
      }),
    );

    const resourceProperties = expr.ident('resourceProperties');
    const propsResult = $E(expr.ident('propsResult'));
    const ret = $E(expr.ident('ret'));

    const reverseMapper = expr.ident(cfnParserNameFromType(propsType));

    factory.addBody(
      stmt.assign(resourceAttributes, new TruthyOr(resourceAttributes, expr.lit({}))),
      stmt.constVar(resourceProperties, options.parser.parseValue(resourceAttributes.Properties)),
      stmt.constVar(propsResult, reverseMapper.call(resourceProperties)),
      stmt
        .if_(CDK_CORE.isResolvableObject(propsResult.value))
        .then(stmt.block(stmt.throw_(Type.ambient('Error').newInstance(expr.lit('Unexpected IResolvable'))))),
      stmt.constVar(ret, this.newInstance(scope, id, propsResult.value)),
    );

    const propKey = expr.ident('propKey');
    const propVal = expr.ident('propVal');
    factory.addBody(
      stmt
        .forConst(expr.destructuringArray(propKey, propVal))
        .in(expr.builtInFn('Object.entries', propsResult.extraProperties))
        .do(Block.with(stmt.expr(ret.addPropertyOverride(propKey, propVal)))),

      options.parser.handleAttributes(ret, resourceAttributes, id),
      stmt.ret(ret),
    );
  }

  private makeConstructor() {
    // Ctor
    const init = this.addInitializer({
      docs: {
        summary: `Create a new \`${this.res.cloudFormationType}\`.`,
      },
    });
    const _scope = init.addParameter({
      name: 'scope',
      type: CONSTRUCTS.Construct,
      documentation: 'Scope in which this resource is defined',
    });
    const id = init.addParameter({
      name: 'id',
      type: Type.STRING,
      documentation: 'Construct identifier for this resource (unique in its scope)',
    });

    const hasRequiredProps = this.propsType.properties.some((p) => !p.optional);
    const props = init.addParameter({
      name: 'props',
      type: this.propsType.type,
      documentation: 'Resource properties',
      default: hasRequiredProps ? undefined : new ObjectLiteral([]),
    });

    init.addBody(
      new SuperInitializer(
        _scope,
        id,
        expr.object({
          type: $T(this.type)[staticResourceTypeName()],
          properties: props,
        }),
      ),

      stmt.sep(),

      // Validate required properties
      ...this.mappableProperties()
        .filter(({ validateRequired }) => validateRequired)
        .map(({ name }) => CDK_CORE.requireProperty(props, expr.lit(name), $this)),

      stmt.sep(),
    );

    init.addBody(
      // Attributes
      ...this.mappableAttributes().map(({ name, tokenizer }) => stmt.assign($this[name], tokenizer)),

      // Props
      ...this.mappableProperties().map(({ name, initializer }) => stmt.assign($this[name], initializer(props))),
    );

    if (this.res.isStateful) {
      this.addDeletionPolicyCheck(init);
    }
  }

  private makeInspectMethod() {
    const inspect = this.addMethod({
      name: 'inspect',
      docs: {
        summary: 'Examines the CloudFormation resource and discloses attributes',
      },
    });
    const $inspector = $E(
      inspect.addParameter({
        name: 'inspector',
        type: CDK_CORE.TreeInspector,
        documentation: 'tree inspector to collect and process attributes',
      }),
    );
    inspect.addBody(
      $inspector.addAttribute(
        expr.lit('aws:cdk:cloudformation:type'),
        $E(expr.sym(this.symbol))[staticResourceTypeName()],
      ),
      $inspector.addAttribute(expr.lit('aws:cdk:cloudformation:props'), $E(expr.this_()).cfnProperties),
    );
  }

  /**
   * Make the cfnProperties getter
   *
   * This produces a set of properties that are going to be passed into renderProperties().
   */
  private makeCfnProperties() {
    this.addProperty({
      name: 'cfnProperties',
      type: Type.mapOf(Type.ANY),
      protected: true,
      getterBody: Block.with(
        stmt.ret(
          expr.object(
            Object.fromEntries(
              this.mappableProperties().flatMap(({ cfnValueToRender }) => Object.entries(cfnValueToRender)),
            ),
          ),
        ),
      ),
    });
  }

  /**
   * Make the renderProperties() method
   *
   * This forwards straight to the props type mapper
   */
  private makeRenderProperties() {
    const m = this.addMethod({
      name: 'renderProperties',
      returnType: Type.mapOf(Type.ANY),
      visibility: MemberVisibility.Protected,
    });
    const props = m.addParameter({
      name: 'props',
      type: Type.mapOf(Type.ANY),
    });
    m.addBody(stmt.ret($E(expr.ident(cfnProducerNameFromType(this.propsType)))(props)));
  }

  private mappableAttributes(): Array<{
    /** The name of the CloudFormation attribute */
    attrName: string;
    attr: Attribute;
    /** The name of the property used in generated code */
    name: string;
    type: Type;
    tokenizer: Expression;
  }> {
    const $ResolutionTypeHint = $T(CDK_CORE.ResolutionTypeHint);

    return Object.entries(this.res.attributes)
      .map(([attrName, attr]) => {
        let type: Type | undefined;
        let tokenizer: Expression | undefined;

        if (attr.type.type === 'string') {
          type = Type.STRING;
          tokenizer = CDK_CORE.tokenAsString($this.getAtt(expr.lit(attrName), $ResolutionTypeHint.STRING));
        } else if (attr.type.type === 'integer') {
          type = Type.NUMBER;
          tokenizer = CDK_CORE.tokenAsNumber($this.getAtt(expr.lit(attrName), $ResolutionTypeHint.NUMBER));
        } else if (attr.type.type === 'number') {
          // COMPAT: Although numbers/doubles could be represented as numbers, historically in cfn2ts they were represented as IResolvable.
          type = CDK_CORE.IResolvable;
          tokenizer = $this.getAtt(expr.lit(attrName), $ResolutionTypeHint.NUMBER);
        } else if (attr.type.type === 'array' && attr.type.element.type === 'string') {
          type = Type.arrayOf(Type.STRING);
          tokenizer = CDK_CORE.tokenAsList($this.getAtt(expr.lit(attrName), $ResolutionTypeHint.STRING_LIST));
        }

        return {
          attrName,
          attr,
          name: attributePropertyName(attrName),
          type: type ?? CDK_CORE.IResolvable,
          tokenizer: tokenizer ?? $this.getAtt(expr.lit(attrName)),
        };
      })
      .sort((a1, a2) => a1.name.localeCompare(a2.name));
  }

  /**
   * From the properties of the current resource's proptype, return class properties and how they should be initialized and converted to CloudFormation
   */
  private mappableProperties(): MappedProperty[] {
    const tagsProperty = this.taggability
      ? propertyNameFromCloudFormation(this.taggability.tagPropertyName)
      : undefined;

    return this.propsType.properties
      .flatMap((prop) => {
        if (prop.name === undefined) {
          throw new Error('wut');
        }
        if (prop.name === tagsProperty) {
          switch (this.taggability?.style) {
            case 'legacy':
              return this.mapLegacyTagProperty(prop);
            case 'modern':
              if (HAS_25610) {
                return this.mapModernTagProperty(prop);
              }
              break;
          }
        }
        return this.mapPropertyDefault(prop);
      })
      .sort((p1, p2) => p1.name.localeCompare(p2.name));
  }

  /**
   * Default mapping for a property
   */
  private mapPropertyDefault(prop: Property): MappedProperty[] {
    return [
      {
        name: prop.name,
        memberOptional: prop.optional,
        validateRequired: !prop.optional,
        memberImmutable: false,
        memberType: prop.type,
        initializer: (props: Expression) => prop.from(props),
        cfnValueToRender: { [prop.name]: $this[prop.name] },
        docsSummary: prop.docs?.summary,
      },
    ];
  }

  private mapLegacyTagProperty(prop: Property): MappedProperty[] {
    const originalProp = this.mapPropertyDefault(prop)[0];
    const rawTagsPropName = `${prop.name}Raw`;

    return [
      {
        // The property must be called 'tags' for the resource to count as ITaggable
        name: 'tags',
        memberOptional: false,
        validateRequired: false,
        memberImmutable: true,
        memberType: CDK_CORE.TagManager,
        initializer: (props: Expression) =>
          new CDK_CORE.TagManager(
            this.tagManagerVariant(),
            expr.lit(this.res.cloudFormationType),
            prop.from(props),
            expr.object({ tagPropertyName: expr.lit(prop.name) }),
          ),
        cfnValueToRender: {
          [prop.name]: $this.tags.renderTags(...(HAS_25610 ? [$this[rawTagsPropName]] : [])),
        },
        docsSummary: prop.docs?.summary,
      },
      {
        // Add the original property under the name 'tagsRaw'. This only exists to allow direct L1 mutation.
        ...originalProp,
        name: rawTagsPropName,
        cfnValueToRender: {},
      },
    ];
  }

  private mapModernTagProperty(prop: Property): MappedProperty[] {
    const originalProp = this.mapPropertyDefault(prop)[0];
    const rawTagsPropName = prop.name;

    return [
      {
        // The property must be called 'cdkTagManager' for the resource to count as ITaggable2
        name: 'cdkTagManager',
        memberOptional: false,
        validateRequired: false,
        memberImmutable: true,
        memberType: CDK_CORE.TagManager,
        initializer: (props: Expression) =>
          new CDK_CORE.TagManager(
            this.tagManagerVariant(),
            expr.lit(this.res.cloudFormationType),
            prop.from(props),
            expr.object({ tagPropertyName: expr.lit(prop.name) }),
          ),
        cfnValueToRender: {
          [prop.name]: $this.tags.renderTags(...(HAS_25610 ? [$this[rawTagsPropName]] : [])),
        },
        docsSummary: prop.docs?.summary,
      },
      {
        // The original property only exist to allow L1 mutation. Actual render is done by the TagManager.
        ...originalProp,
        cfnValueToRender: {},
      },
    ];
  }

  /**
   * Add a validation to ensure that this resource has a deletionPolicy
   *
   * A deletionPolicy is required (and in normal operation an UpdateReplacePolicy
   * would also be set if a user doesn't do complicated shenanigans, in which case they probably know what
   * they're doing.
   *
   * Only do this for L1s embedded in L2s (to force L2 authors to add a way to set this policy). If we did it for all L1s:
   *
   * - users working at the L1 level would start getting synthesis failures when we add this feature
   * - the `cloudformation-include` library that loads CFN templates to L1s would start failing when it loads
   *   templates that don't have DeletionPolicy set.
   */
  private addDeletionPolicyCheck(init: Initializer) {
    const validator = new AnonymousInterfaceImplementation({
      validate: new Lambda(
        [],
        expr.cond(
          expr.eq($this.cfnOptions.deletionPolicy, expr.UNDEFINED),
          expr.lit([
            `'${this.res.cloudFormationType}' is a stateful resource type, and you must specify a Removal Policy for it. Call 'resource.applyRemovalPolicy()'.`,
          ]),
          expr.lit([]),
        ),
      ),
    });

    init.addBody(
      stmt
        .if_(expr.binOp(new IsNotNullish($this.node.scope), '&&', CDK_CORE.Resource.isResource($this.node.scope)))
        .then(Block.with($this.node.addValidation(validator))),
    );
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

    throw new Error(`Unknown variant: ${this.res.tagInformation?.variant}`);
  }
}

interface MappedProperty {
  readonly name: string;
  readonly memberOptional: boolean;
  readonly validateRequired: boolean;
  readonly memberImmutable: boolean;
  readonly memberType: Type;
  readonly initializer: (props: Expression) => Expression;

  /**
   * Lowercase property name(s) and expression(s) to render to get this property into CFN
   *
   * We will do a separate conversion of the casing of the props object, so don't do that here.
   */
  readonly cfnValueToRender: Record<string, Expression>;
  readonly docsSummary?: string;
}
