/* eslint-disable import/no-extraneous-dependencies */
import path from 'path';
import { buildDatabase } from '@aws-cdk/service-spec-build';
import { SchemaValidation } from '@aws-cdk/service-spec-sources';
import { InterfaceType, Module, Case, TypeScriptRenderer, MemberKind } from '@cdklabs/typewriter';
import * as jsii from '@jsii/spec';
import * as fs from 'fs-extra';
import { propertyTypeToTypeReferenceSpec } from './utils';

class ServiceModule extends Module {
  public constructor(public readonly service: string) {
    super(`@aws-cdk/${service}-l1`);
  }
}

async function main() {
  const renderer = new TypeScriptRenderer();

  const { db } = await buildDatabase({
    validateJsonSchema: SchemaValidation.NONE,
  });

  const services = db.all('resource').map((r) => {
    const serviceName = r.cloudFormationType.split('::').slice(1).join('.').toLowerCase();
    const service = new ServiceModule(serviceName);
    const propsInterface = `Cfn${r.name}Props`;

    new InterfaceType(service, {
      export: true,
      name: propsInterface,
      kind: jsii.TypeKind.Interface,
      properties: Object.entries(r.properties).map(([name, p]) => ({
        kind: MemberKind.Property,
        name: Case.firstCharToLower(name),
        type: propertyTypeToTypeReferenceSpec(p.type) as any,
        immutable: true,
      })),
    });

    return service;
  });

  console.log('Generating %i Resources for %i Services', db.all('resource').length, services.length);

  const outputPath = path.join(__dirname, '../services/');
  fs.removeSync(outputPath);
  for (const service of services) {
    const filePath = path.join(outputPath, `${service.service.toLowerCase()}.ts`);
    fs.outputFileSync(filePath, renderer.render(service));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
