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
    const { properties } = config;
    const kmsKey = this.props.kmsKey;

    // Group properties by context
    const contexts = new Map<string, any[]>();
    for (const prop of properties) {
      const ctx = prop.context || 'default';
      if (!contexts.has(ctx)) {
        contexts.set(ctx, []);
      }
      contexts.get(ctx)!.push(prop);
    }

    // Apply encryption for each context
    for (const [context, props] of contexts) {
      this.applyEncryptionForContext(resource, props, kmsKey);
    }
  }

  private applyEncryptionForContext(resource: CfnResource, properties: any[], kmsKey?: string): void {
    const configProp = properties.find(p => p.purpose === 'configuration');
    const topLevelProps = properties.filter(p => !p.path);
    const nestedProps = properties.filter(p => p.path);

    // If there's a configuration object with nested properties
    if (configProp && nestedProps.length > 0) {
      const obj: any = {};
      for (const prop of nestedProps) {
        const key = prop.path.split('.').pop()?.replace('[]', '');
        if (!key) continue;
        
        if (prop.purpose === 'enable-flag') {
          obj[key] = true;
        } else if (prop.purpose === 'kms-key-id' && kmsKey) {
          obj[key] = kmsKey;
        } else if (prop.purpose === 'encryption-type') {
          if (prop.acceptedValues) {
            obj[key] = kmsKey ? (prop.acceptedValues.find((v: string) => v.includes('KMS')) || prop.acceptedValues[0]) : prop.acceptedValues[0];
          } else {
            obj[key] = kmsKey ? 'KMS' : 'AES256';
          }
        }
      }
      resource.addPropertyOverride(configProp.name, obj);
      return;
    }

    // Apply top-level properties
    for (const prop of topLevelProps) {
      if (prop.purpose === 'enable-flag') {
        resource.addPropertyOverride(prop.name, true);
      } else if (prop.purpose === 'kms-key-id' && kmsKey) {
        resource.addPropertyOverride(prop.name, kmsKey);
      } else if (prop.purpose === 'encryption-type' && kmsKey) {
        if (prop.acceptedValues) {
          const kmsValue = prop.acceptedValues.find((v: string) => v.includes('KMS'));
          if (kmsValue) {
            resource.addPropertyOverride(prop.name, kmsValue);
          }
        }
      }
    }
  }
}
