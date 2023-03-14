import { Module } from './module';

export class ExternalModule extends Module {
  public constructor(fqn: string) {
    super(fqn);
  }
}
