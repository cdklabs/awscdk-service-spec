import { Resource, TypeDefinition } from '@aws-cdk/service-spec';
import { TypeConverter } from './type-converter';
import { ClassType, Module, StructType } from '@cdklabs/typewriter';
import { structNameFromTypeDefinition } from '../naming/conventions';
import { splitDocumentation } from '../split-summary';
import { cloudFormationDocLink } from '../naming/doclink';
import { CloudFormationMapping } from '../cloudformation-mapping';
import { TypeDefinitionDecider } from './type-definition-decider';

export interface TypeDefinitionTypeBuilderOptions {
  readonly typeDefinition: TypeDefinition;
  readonly converter: TypeConverter;
  readonly resource: Resource;
  readonly resourceClass: ClassType;
}

/**
 * Builds a struct type for a TypeDefinition in the database model
 *
 * Uses the TypeDefinitionDecider for the actual decisions, and carries those out.
 */
export class TypeDefinitionTypeBuilder {
  public readonly structType: StructType;

  private readonly typeDefinition: TypeDefinition;
  private readonly converter: TypeConverter;
  private readonly resource: Resource;
  private readonly resourceClass: ClassType;
  private readonly module: Module;

  constructor(options: TypeDefinitionTypeBuilderOptions) {
    this.typeDefinition = options.typeDefinition;
    this.converter = options.converter;
    this.resource = options.resource;
    this.resourceClass = options.resourceClass;

    this.module = Module.of(this.resourceClass);
    this.structType = new StructType(this.resourceClass, {
      export: true,
      name: structNameFromTypeDefinition(this.typeDefinition),
      docs: {
        ...splitDocumentation(this.typeDefinition.documentation),
        see: cloudFormationDocLink({
          resourceType: this.resource.cloudFormationType,
          propTypeName: this.typeDefinition.name,
        }),
      },
    });
  }

  public makeMembers() {
    const cfnMapping = new CloudFormationMapping(this.module);

    const decider = new TypeDefinitionDecider(this.resource, this.typeDefinition, this.converter);

    for (const prop of decider.properties) {
      this.structType.addProperty(prop.propertySpec);
      cfnMapping.add(prop.cfnMapping);
    }

    cfnMapping.makeCfnProducer(this.module, this.structType);
    cfnMapping.makeCfnParser(this.module, this.structType);
  }
}
