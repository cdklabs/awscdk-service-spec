import { Resource, TypeDefinition } from '@aws-cdk/service-spec';
import { TypeDeclaration } from '@cdklabs/typewriter';
import camelcase from 'camelcase';

/**
 * Convert a CloudFormation name to a nice TypeScript name
 *
 * We use a library to camelcase, and fix up some things that translate incorrectly.
 *
 * For example, the library breaks when pluralizing an abbreviation, such as "ProviderARNs" -> "providerArNs".
 *
 * We currently recognize "ARNs", "MBs" and "AZs".
 */
export function propertyNameFromCloudFormation(name: string): string {
  if (name === 'VPCs') {
    return 'vpcs';
  }

  // Lightsail contains a property called "GetObject", which isn't a jsii-compliant name
  // as it conflicts with generated getters in other languages (e.g., Java, C#).
  // For now, hard-coding a replacement property name to something that's frankly better anyway.
  if (name === 'GetObject') {
    name = 'objectAccess';
  }

  // GuardDuty contains a property named "Equals", which isn't a jsii-compliant name as it
  // conflicts with standard Java/C# object methods.
  if (name === 'Equals') {
    name = 'equalTo';
  }

  let ret = camelcase(name);

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const suffixes: { [key: string]: string } = { ARNs: 'Arns', MBs: 'MBs', AZs: 'AZs' };

  for (const suffix of Object.keys(suffixes)) {
    if (name.endsWith(suffix)) {
      return ret.slice(0, -suffix.length) + suffixes[suffix];
    }
  }

  return ret;
}

export function structNameFromTypeDefinition(def: TypeDefinition) {
  return `${def.name}Property`;
}

export function classNameFromResource(res: Resource) {
  return `Cfn${res.name}`;
}

export function propStructNameFromResource(res: Resource) {
  return `${classNameFromResource(res)}Props`;
}

export function cfnProducerNameFromType(struct: TypeDeclaration | string) {
  const name = typeof struct === 'string' ? struct : struct.name;
  return `convert${name}ToCloudFormation`;
}

export function cfnParserNameFromType(struct: TypeDeclaration | string) {
  const name = typeof struct === 'string' ? struct : struct.name;
  return `${name}FromCloudFormation`;
}

export function cfnPropsValidatorNameFromType(struct: TypeDeclaration | string) {
  const name = typeof struct === 'string' ? struct : struct.name;
  return `${name}Validator`;
}

export function staticResourceTypeName() {
  return 'CFN_RESOURCE_TYPE_NAME';
}

export function attributePropertyName(attrName: string) {
  return `attr${attrName.replace(/[^a-zA-Z0-9]/g, '')}`;
}
