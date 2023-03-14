import { PropertyType, Resource } from '@aws-cdk/service-spec';
import {
  $E,
  $T,
  Block,
  ClassType,
  expr,
  Expression,
  MemberVisibility,
  Scope,
  stmt,
  StructType,
  SuperInitializer,
  TruthyOr,
  Type,
} from '@cdklabs/typewriter';
import { Stability } from '@jsii/spec';
import {
  attributePropertyName,
  classNameFromResource,
  cfnParserNameFromType,
  staticResourceTypeName,
  cfnProducerNameFromType,
} from '../naming/conventions';
import { cloudFormationDocLink } from '../naming/doclink';
import { splitDocumentation } from '../split-summary';
import { CDK_CORE, CONSTRUCTS } from './cdk';

export interface ITypeHost {
  typeFromSpecType(type: PropertyType): Type;
}

export interface ResourceClassSpec {
  res: Resource;
  propsType: StructType;
  typeHost: ITypeHost;
}

export class ResourceClass extends ClassType {
  constructor(scope: Scope, private readonly opts: ResourceClassSpec) {
    super(scope, {
      export: true,
      name: classNameFromResource(opts.res),
      docs: {
        ...splitDocumentation(opts.res.documentation),
        stability: Stability.External,
        see: cloudFormationDocLink({
          resourceType: opts.res.cloudFormationType,
        }),
      },
      extends: CDK_CORE.CfnResource,
      implements: [CDK_CORE.IInspectable],
    });

    this.addProperty({
      name: staticResourceTypeName(),
      immutable: true,
      static: true,
      type: Type.STRING,
      initializer: expr.lit(opts.res.cloudFormationType),
      docs: {
        summary: 'The CloudFormation resource type name for this resource class.',
      },
    });

    this.addFromCloudFormationFactory(opts.propsType);

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
    for (const prop of opts.propsType.properties) {
      this.addProperty({
        name: prop.name,
        type: prop.type,
        optional: prop.optional,
        docs: {
          summary: prop.docs?.summary,
        },
      });
    }

    this.makeConstructor();
    this.makeInspectMethod();
    this.makeCfnProperties();
    this.makeRenderProperties();
  }

  protected addFromCloudFormationFactory(propsType: StructType) {
    const factory = this.addMethod({
      name: '_fromCloudFormation',
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

    // FIXME: Reverse mapper
    const reverseMapper = expr.ident(cfnParserNameFromType(propsType));

    factory.addBody(
      stmt.assign(resourceAttributes, new TruthyOr(resourceAttributes, expr.lit({}))),
      stmt.constVar(resourceProperties, options.parser.parseValue(resourceAttributes.Properties)),
      stmt.constVar(propsResult, reverseMapper.call(resourceProperties)),
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
        summary: `Create a new \`${this.opts.res.cloudFormationType}\`.`,
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
    const props = init.addParameter({
      name: 'props',
      type: this.opts.propsType.type,
      documentation: 'Resource properties',
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
      ...this.opts.propsType.properties
        .filter((p) => !p.optional)
        .map((p) => stmt.expr(CDK_CORE.requireProperty(props, expr.lit(p.name), $this))),

      stmt.sep(),
    );

    init.addBody(
      // Attributes
      ...this.mappableAttributes().map(({ name, tokenizer }) => stmt.assign($this[name], tokenizer)),

      // Props
      ...this.opts.propsType.properties.map((prop) => stmt.assign($this[prop.name], prop.from(props))),
    );
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

  private makeCfnProperties() {
    const $this = $E(expr.this_());

    this.addProperty({
      name: 'cfnProperties',
      type: Type.mapOf(Type.ANY),
      protected: true,
      getterBody: Block.with(
        stmt.ret(expr.object(Object.fromEntries(this.opts.propsType.properties.map((p) => [p.name, $this[p.name]])))),
      ),
    });
  }

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
    m.addBody(stmt.ret($E(expr.ident(cfnProducerNameFromType(this.opts.propsType)))(props)));
  }

  private mappableAttributes() {
    return Object.entries(this.opts.res.attributes).flatMap(([attrName, attr]) => {
      let type: Type | undefined;
      let tokenizer: Expression = expr.ident('<dummy>');

      if (attr.type.type === 'string') {
        type = Type.STRING;
        tokenizer = CDK_CORE.tokenAsString(
          expr.this_().callMethod('getAtt', expr.lit(attrName), expr.type(CDK_CORE.ResolutionTypeHint).prop('STRING')),
        );
      } else if (attr.type.type === 'number') {
        type = Type.NUMBER;
        tokenizer = CDK_CORE.tokenAsNumber(
          expr.this_().callMethod('getAtt', expr.lit(attrName), expr.type(CDK_CORE.ResolutionTypeHint).prop('NUMBER')),
        );
      } else if (attr.type.type === 'array' && attr.type.element.type === 'string') {
        type = Type.arrayOf(Type.STRING);
        tokenizer = CDK_CORE.tokenAsList(
          expr
            .this_()
            .callMethod('getAtt', expr.lit(attrName), expr.type(CDK_CORE.ResolutionTypeHint).prop('STRING_LIST')),
        );
      }

      return type ? [{ attrName, attr, name: attributePropertyName(attrName), type, tokenizer }] : [];
    });
  }
}
