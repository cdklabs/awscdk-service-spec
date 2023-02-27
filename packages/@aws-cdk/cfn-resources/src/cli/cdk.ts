import { ExternalModule } from '@cdklabs/typewriter';
import { Statement } from '@cdklabs/typewriter/src/statements';

export class CdkCore extends ExternalModule {
  public objectToCloudFormation(...args: Statement[]) {
    return this.import('cdk')
      .invoke('objectToCloudFormation')
      .with(...args);
  }
  public stringToCloudFormation(...args: Statement[]) {
    return this.import('cdk')
      .invoke('stringToCloudFormation')
      .with(...args);
  }
}
