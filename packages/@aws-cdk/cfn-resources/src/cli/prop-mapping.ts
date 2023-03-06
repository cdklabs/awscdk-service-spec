/**
 * Retain a list of properties with their CloudFormation and TypeScript names
 */
export class PropMapping {
  private readonly cfn2ts: Record<string, string> = {};

  public add(cfnName: string, tsName: string) {
    this.cfn2ts[cfnName] = tsName;
  }

  public cfnFromTs(): Array<[string, string]> {
    return Object.entries(this.cfn2ts);
  }
}
