import { Resource } from '@aws-cdk/service-spec';
import { InterfaceType, Module } from '@cdklabs/typewriter';
import { resourcePropsSpec } from './ast';

export class ServiceModule extends Module {
  public constructor(public readonly service: string) {
    super(`@aws-cdk/${service}-l1`);
  }
}

export function moduleFromResource(r: Resource) {
  const serviceName = r.cloudFormationType.split('::').slice(1).join('.').toLowerCase();
  const service = new ServiceModule(serviceName);

  new InterfaceType(service, resourcePropsSpec(r));

  return service;
}
