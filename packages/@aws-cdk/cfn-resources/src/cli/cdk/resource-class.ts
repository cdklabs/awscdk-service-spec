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
import {
  attributePropertyName,
  classNameFromResource,
  cfnParserNameFromType,
  staticResourceTypeName,
  cfnProducerNameFromType,
  staticRequiredTransform,
} from '../naming/conventions';
import { cloudFormationDocLink } from '../naming/doclink';
import { splitDocumentation } from '../split-summary';

export interface ITypeHost {
  typeFromSpecType(type: PropertyType): Type;
}

export interface ResourceClassSpec {
  propsType: StructType;
}

export class ResourceClass extends ClassType {
  private _propsType?: StructType;

  constructor(scope: IScope, private readonly res: Resource, suffix?: string) {
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
      implements: [CDK_CORE.IInspectable, ...(res.tagPropertyName !== undefined ? [CDK_CORE.ITaggable] : [])],
    });
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

    if (this.res.cloudFormationTransform) {
      this.addProperty({
        name: staticRequiredTransform(),
        immutable: true,
        static: true,
        type: Type.STRING,
        initializer: expr.lit(this.res.cloudFormationTransform),
        docs: {
          summary: 'The `Transform` a template must use in order to use this resource',
        },
      });
    }

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

    const $this = $E(expr.this_());

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

    if (this.res.cloudFormationTransform) {
      init.addBody($this.stack.addTransform($T(this.type)[staticRequiredTransform()]), stmt.sep());
    }

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
            Object.fromEntries(this.mappableProperties().map(({ name, valueToRender }) => [name, valueToRender])),
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
    const $this = $E(expr.this_());
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

  private mappableProperties(): Array<{
    name: string;
    memberOptional: boolean;
    validateRequired: boolean;
    memberImmutable: boolean;
    memberType: Type;
    initializer: (props: Expression) => Expression;
    valueToRender: Expression;
    docsSummary?: string;
  }> {
    const $this = $E(expr.this_());
    return this.propsType.properties
      .map((prop) => {
        // FIXME: Would be nicer to thread this value through
        const tagType = isTagType(this.res, prop.name);

        if (tagType) {
          return {
            // The property must be called 'tags' for the resource to count as ITaggable
            name: 'tags',
            memberOptional: false,
            validateRequired: false,
            memberImmutable: true,
            memberType: CDK_CORE.TagManager,
            initializer: (props: Expression) =>
              new CDK_CORE.TagManager(
                translateTagType(this.res, prop),
                expr.lit(this.res.cloudFormationType),
                prop.from(props),
                expr.object({ tagPropertyName: expr.lit(prop.name) }),
              ),
            valueToRender: $this.tags.renderTags(),
            docsSummary: prop.docs?.summary,
          };
        }

        return {
          name: prop.name,
          memberOptional: prop.optional,
          validateRequired: !prop.optional,
          memberImmutable: false,
          memberType: prop.type,
          initializer: (props: Expression) => prop.from(props),
          valueToRender: $this[prop.name],
          docsSummary: prop.docs?.summary,
        };
      })
      .sort((p1, p2) => p1.name.localeCompare(p2.name));
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
    const $this = $E(expr.this_());

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
}

/**
 * Translates a TagVariant to the core.TagType enum
 */
function translateTagType(resource: Resource, prop: Property) {
  if (resource.cloudFormationType === 'AWS::AutoScaling::AutoScalingGroup') {
    return CDK_CORE.TagType.AUTOSCALING_GROUP;
  }

  if (prop.type.mapOfType) {
    return CDK_CORE.TagType.MAP;
  }

  return CDK_CORE.TagType.STANDARD;
}

/**
 * For a given resource and property, if the property is the resource's tag property,
 * returns the tag type for the property.
 *
 * Returns `undefined` otherwise.
 */
function isTagType(_resource: Resource, propName: string): boolean {
  const tagPropertyNames = {
    fileSystemTags: '',
    hostedZoneTags: '',
    tags: '',
    userPoolTags: '',
    accessPointTags: '',
  };

  return propName in tagPropertyNames;
}
