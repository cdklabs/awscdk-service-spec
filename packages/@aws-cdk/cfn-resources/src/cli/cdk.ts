import { Callable, ExternalModule } from '@cdklabs/typewriter';

export class CdkCore extends ExternalModule {
  constructor(fqn: string) {
    super(fqn);

    this.addType(new Callable(this, { name: 'objectToCloudFormation' }));
    this.addType(new Callable(this, { name: 'stringToCloudFormation' }));
    this.addType(new Callable(this, { name: 'booleanToCloudFormation' }));
    this.addType(new Callable(this, { name: 'numberToCloudFormation' }));
    this.addType(new Callable(this, { name: 'canInspect' }));
    this.addType(new Callable(this, { name: 'listMapper' }));
    this.addType(new Callable(this, { name: 'hashMapper' }));
  }
}

export const CDK_CORE = new CdkCore('aws-cdk-lib');
