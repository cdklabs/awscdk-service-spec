import { IAspect, IConstruct, Annotations } from 'aws-cdk-lib';
import { CfnResource } from 'aws-cdk-lib';
import * as encryptionData from './sources/EncryptionAtRest/data.json';

export interface EncryptionAtRestAspectProps {
  /**
   * KMS key to use for encryption.
   * Can be a key ID, ARN, alias, or alias ARN.
   * If not provided, AWS managed keys will be used where applicable.
   */
  readonly kmsKey?: string;

  /**
   * Whether to enable encryption.
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * Whether to fail if encryption cannot be applied to a resource.
   * @default false - skip resources that cannot be encrypted
   */
  readonly strict?: boolean;
}

export class EncryptionAtRestAspect implements IAspect {
  constructor(private readonly props: EncryptionAtRestAspectProps = {}) {}

  visit(node: IConstruct): void {
    if (!(node instanceof CfnResource)) {
      return;
    }

    const enabled = this.props.enabled ?? true;
    if (!enabled) {
      return;
    }

    const config = encryptionData[node.cfnResourceType as keyof typeof encryptionData];
    if (!config) {
      if (this.props.strict) {
        throw new Error(`No encryption configuration for ${node.cfnResourceType} at ${node.node.path}`);
      }
      return;
    }

    if (this.hasEncryption(node, config)) {
      const message = `Resource already has encryption configured at ${node.node.path}`;
      if (this.props.strict) {
        throw new Error(message);
      }
      Annotations.of(node).addWarning(message);
      return;
    }

    try {
      this.applyEncryption(node, config);
    } catch (error) {
      if (this.props.strict) {
        throw error;
      }
      Annotations.of(node).addWarning(`Failed to apply encryption: ${error}`);
    }
  }

  private hasEncryption(resource: CfnResource, config: any): boolean {
    const { properties } = config;
    
    for (const prop of properties) {
      if (prop.purpose === 'enable-flag' || prop.purpose === 'kms-key-id' || prop.purpose === 'configuration') {
        const value = (resource as any)[prop.name];
        if (value !== undefined && value !== null) {
          return true;
        }
      }
    }
    
    return false;
  }

  private applyEncryption(resource: CfnResource, config: any): void {
    const { pattern, properties } = config;
    const kmsKey = this.props.kmsKey;

    if (pattern === 'kms-only') {
      const kmsProp = properties.find((p: any) => p.purpose === 'kms-key-id');
      if (kmsProp && kmsKey) {
        resource.addPropertyOverride(kmsProp.name, kmsKey);
      }
      return;
    }

    if (pattern === 'boolean-and-key') {
      const enableProp = properties.find((p: any) => p.purpose === 'enable-flag');
      const kmsProp = properties.find((p: any) => p.purpose === 'kms-key-id');
      
      if (enableProp) {
        resource.addPropertyOverride(enableProp.name, true);
      }
      if (kmsProp && kmsKey) {
        resource.addPropertyOverride(kmsProp.name, kmsKey);
      }
      return;
    }

    if (pattern === 'specification-object' || pattern === 'configuration-object') {
      const configProp = properties.find((p: any) => p.purpose === 'configuration');
      if (!configProp) return;

      const nestedProps = properties.filter((p: any) => p.path);
      if (nestedProps.length > 0) {
        const obj: any = {};
        for (const prop of nestedProps) {
          const key = prop.path.split('.')[1];
          if (prop.purpose === 'enable-flag') {
            obj[key] = true;
          } else if (prop.purpose === 'kms-key-id' && kmsKey) {
            obj[key] = kmsKey;
          } else if (prop.purpose === 'encryption-type' && prop.acceptedValues) {
            obj[key] = prop.acceptedValues[0];
          }
        }
        resource.addPropertyOverride(configProp.name, obj);
      }
      return;
    }

    if (pattern === 'type-based-selection') {
      const configProp = properties.find((p: any) => p.purpose === 'configuration');
      const typeProp = properties.find((p: any) => p.purpose === 'encryption-type');
      const kmsProp = properties.find((p: any) => p.purpose === 'kms-key-id');

      if (configProp && typeProp?.path) {
        const obj: any = {};
        const typeKey = typeProp.path.split('.')[1];
        obj[typeKey] = kmsKey ? typeProp.acceptedValues?.[1] || 'KMS' : typeProp.acceptedValues?.[0] || 'AES256';
        
        if (kmsProp?.path && kmsKey) {
          const kmsKeyName = kmsProp.path.split('.')[1];
          obj[kmsKeyName] = kmsKey;
        }
        
        resource.addPropertyOverride(configProp.name, obj);
      }
      return;
    }

    // Fallback: apply first KMS property found
    const kmsProp = properties.find((p: any) => p.purpose === 'kms-key-id');
    if (kmsProp && kmsKey) {
      resource.addPropertyOverride(kmsProp.name, kmsKey);
    }
  }
}
