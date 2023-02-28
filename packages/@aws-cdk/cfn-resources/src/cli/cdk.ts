import { ExternalModule } from '@cdklabs/typewriter';
import { Expression } from '@cdklabs/typewriter/src/expression';

export class CdkCore extends ExternalModule {
  public objectToCloudFormation(...args: Expression[]) {
    return this.import('cdk')
      .invoke('objectToCloudFormation')
      .with(...args);
  }
  public stringToCloudFormation(...args: Expression[]) {
    return this.import('cdk')
      .invoke('stringToCloudFormation')
      .with(...args);
  }
}
