import { Module } from '@cdklabs/typewriter';

export class ServiceModule extends Module {
  public constructor(public readonly service: string) {
    super(`@aws-cdk/${service}-l1`);
  }
}
