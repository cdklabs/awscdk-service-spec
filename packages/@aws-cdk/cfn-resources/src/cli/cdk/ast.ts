import { DatabaseSchema, Resource, Service } from '@aws-cdk/service-spec';
import { Database } from '@cdklabs/tskb';
import { StructType, Module } from '@cdklabs/typewriter';
import { Stability } from '@jsii/spec';
import { CDK_CORE, CONSTRUCTS, ModuleImportLocations } from './cdk';
import { ResourceClass } from './resource-class';
import { TypeConverter } from './type-converter';
import { classNameFromResource, propStructNameFromResource } from '../naming/conventions';
import { cloudFormationDocLink } from '../naming/doclink';
import { PropMapping } from '../prop-mapping';

/**
 * A module containing a single resource
 */
export class ResourceModule extends Module {
  public constructor(public readonly service: string, public readonly resource: string) {
    super(`@aws-cdk/${service}/${resource}-l1`);
  }
}

/**
 * A module containing a service
 */
export class ServiceModule extends Module {
  public constructor(public readonly service: string, public readonly shortName: string) {
    super(`@aws-cdk/${service}`);
  }
}

export interface AstBuilderProps {
  readonly db: Database<DatabaseSchema>;
  /**
   * Override the locations modules are imported from
   */
  readonly importLocations?: ModuleImportLocations;
}

export class AstBuilder<T extends Module> {
  public static forService(service: Service, props: AstBuilderProps): AstBuilder<ServiceModule> {
    const scope = new ServiceModule(service.name, service.shortName);
    const ast = new AstBuilder(scope, props);

    const resources = props.db.follow('hasResource', service);
    for (const link of resources) {
      ast.addResource(link.to);
    }

    return ast;
  }

  public static forResource(resource: Resource, props: AstBuilderProps): AstBuilder<ResourceModule> {
    const parts = resource.cloudFormationType.toLowerCase().split('::');
    const scope = new ResourceModule(parts[1], parts[2]);

    const ast = new AstBuilder(scope, props);
    ast.addResource(resource);

    return ast;
  }
  public readonly db: Database<DatabaseSchema>;

  protected constructor(public readonly scope: T, props: AstBuilderProps) {
    this.db = props.db;

    CDK_CORE.import(scope, 'cdk', { fromLocation: props.importLocations?.core });
    CONSTRUCTS.import(scope, 'constructs');
    CDK_CORE.helpers.import(scope, 'cfn_parse', { fromLocation: props.importLocations?.coreHelpers });
  }

  public addResource(resource: Resource) {
    const resourceClass = new ResourceClass(this.scope, resource);

    const converter = new TypeConverter({ db: this.db, resource, resourceClass });
    const propsType = this.addResourcePropsType(resource, converter);
    resourceClass.buildMembers(propsType);
  }

  protected addResourcePropsType(r: Resource, converter: TypeConverter) {
    const propsInterface = new StructType(this.scope, {
      export: true,
      name: propStructNameFromResource(r),
      docs: {
        summary: `Properties for defining a \`${classNameFromResource(r)}\``,
        stability: Stability.External,
        see: cloudFormationDocLink({
          resourceType: r.cloudFormationType,
        }),
      },
    });
    const mapping = new PropMapping(this.scope);
    for (const [name, prop] of Object.entries(r.properties)) {
      converter.addStructProperty(propsInterface, mapping, name, prop);
    }

    converter.makeCfnProducer(propsInterface, mapping);
    converter.makeCfnParser(propsInterface, mapping, true);
    return propsInterface;
  }
}
