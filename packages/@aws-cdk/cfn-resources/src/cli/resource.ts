import { Module } from '@cdklabs/typewriter';

export class ResourceModule extends Module {
  public constructor(public readonly service: string, public readonly resource: string) {
    super(`@aws-cdk/${service}-${resource}-l1`);
  }
}
