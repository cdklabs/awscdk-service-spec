import { Module } from '@cdklabs/typewriter';

export class ServiceModule extends Module {
  public constructor(public readonly service: string, public readonly shortName: string) {
    super(`@aws-cdk/${service}`);
  }
}
