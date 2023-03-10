import { PropertyType, Resource } from '@aws-cdk/service-spec';
import {
  $E,
  Block,
  ClassType,
  expr,
  Expression,
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
  reverseMapperNameFromType,
  staticResourceTypeName,
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
  }

  protected addFromCloudFormationFactory(propsType: StructType) {
    const factory = this.addMethod({
      name: '_fromCloudFormation',
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
    const resourceAttributes = factory.addParameter({ name: 'resourceAttributes', type: Type.ANY });
    const options = factory.addParameter({
      name: 'options',
      type: CDK_CORE.helpers.FromCloudFormationOptions,
    });

    const resourceProperties = expr.ident('resourceProperties');
    const propsResult = expr.ident('resourceProperties');
    const ret = expr.ident('ret');

    // FIXME: Reverse mapper
    const reverseMapper = expr.ident(reverseMapperNameFromType(propsType));

    factory.addBody(
      stmt.assign(resourceAttributes, new TruthyOr(resourceAttributes, expr.lit({}))),
      stmt.constVar(
        resourceProperties,
        options.prop('parser').callMethod('parseValue', resourceAttributes.prop('Properties')),
      ),
      stmt.constVar(propsResult, reverseMapper.call(resourceProperties)),
      stmt.constVar(ret, this.newInstance(scope, id, propsResult.prop('value'))),
    );

    const propKey = expr.ident('propKey');
    const propVal = expr.ident('propVal');
    factory.addBody(
      stmt
        .forConst(expr.destructuringArray(propKey, propVal))
        .in(expr.builtInFn('Object.entries', propsResult.prop('extraProperties')))
        .do(Block.with(stmt.expr(ret.callMethod('addPropertyOverride', propKey, propVal)))),
    );

    factory.addBody(
      stmt.expr(options.prop('parser').callMethod('handleAttributes', ret, resourceAttributes, id)),
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
          type: expr.sym(this.symbol).prop(staticResourceTypeName()),
          properties: props,
        }),
      ),

      stmt.sep(),

      // Validate required properties
      ...this.opts.propsType.properties
        .filter((p) => !p.optional)
        .map((p) => stmt.expr(CDK_CORE.requireProperty(props, expr.lit(p.name), $this))),

      stmt.sep(),

      // Attributes
      ...this.mappableAttributes().map(({ name, tokenizer }) => stmt.assign($this[name], tokenizer)),

      // Props
      ...this.opts.propsType.properties.map((prop) => stmt.assign($this[prop.name], prop.from(props))),
    );
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
        tokenizer = CDK_CORE.tokenAsString(
          expr.this_().callMethod('getAtt', expr.lit(attrName), expr.type(CDK_CORE.ResolutionTypeHint).prop('NUMBER')),
        );
      } else if (attr.type.type === 'array' && attr.type.element.type === 'string') {
        type = Type.arrayOf(Type.STRING);
        tokenizer = CDK_CORE.tokenAsString(
          expr
            .this_()
            .callMethod('getAtt', expr.lit(attrName), expr.type(CDK_CORE.ResolutionTypeHint).prop('STRING_LIST')),
        );
      }

      return type ? [{ attrName, attr, name: attributePropertyName(attrName), type, tokenizer }] : [];
    });
  }
}
