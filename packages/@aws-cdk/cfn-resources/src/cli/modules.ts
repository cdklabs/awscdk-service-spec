import { Module } from '@cdklabs/typewriter';
import { CdkCore, Constructs, ModuleImports } from './cdk/cdk';

export interface AwsCdkLibModuleProps {
  /**
   * The import names used to import modules
   */
  readonly importNames?: ModuleImports;
}

export abstract class AwsCdkLibModule extends Module {
  public CDK_CORE: CdkCore;
  public CONSTRUCTS: Constructs;

  public constructor(fqn: string, props: AwsCdkLibModuleProps = {}) {
    super(fqn);
    this.CDK_CORE = new CdkCore(props.importNames?.core ?? 'aws-cdk-lib', props.importNames?.coreHelpers);
    this.CONSTRUCTS = new Constructs();
  }
}

export class ResourceModule extends AwsCdkLibModule {
  public constructor(public readonly service: string, public readonly resource: string, importNames?: ModuleImports) {
    super(`@aws-cdk/${service}/${resource}-l1`, { importNames });
  }
}

export class ServiceModule extends AwsCdkLibModule {
  public constructor(public readonly service: string, public readonly shortName: string, importNames?: ModuleImports) {
    super(`@aws-cdk/${service}`, { importNames });
  }
}
