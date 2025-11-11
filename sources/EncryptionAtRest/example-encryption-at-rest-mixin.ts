import { IConstruct } from 'constructs';
import { CfnResource } from 'aws-cdk-lib';
// this is a temporary hack. we will not load this file at runtime, but use it at build time to generate the mixin
import * as encryptionData from './data.json';

export interface EncryptionAtRestProps {
  /**
   * KMS key to use for encryption.
   * Can be a key ID, ARN, alias, or alias ARN.
   * If not provided, AWS managed keys will be used where applicable.
   */
  readonly kmsKey?: string;
}

/**
 * Mixin that applies encryption at rest to AWS resources.
 * 
 * Supports 150+ AWS resource types with automatic detection of encryption patterns.
 * 
 * @example
 * ```typescript
 * const bucket = new s3.CfnBucket(scope, 'Bucket')
 *   .with(new EncryptionAtRest({ kmsKey: 'arn:aws:kms:...' }));
 * 
 * const table = new dynamodb.CfnTable(scope, 'Table')
 *   .with(new EncryptionAtRest());
 * ```
 */
export class EncryptionAtRest {
  constructor(private readonly props: EncryptionAtRestProps = {}) {}

  /**
   * Check if this mixin can be applied to the given construct.
   */
  supports(construct: IConstruct): boolean {
    if (!CfnResource.isCfnResource(construct)) {
      return false;
    }
    return construct.cfnResourceType in encryptionData;
  }

  /**
   * Apply encryption at rest to the construct.
   */
  applyTo(construct: IConstruct): IConstruct {
    if (!this.supports(construct)) {
      return construct;
    }

    const config = encryptionData[construct.cfnResourceType as keyof typeof encryptionData];
    if (!config) {
      return construct;
    }

    this.applyEncryption(construct, config);
    return construct;
  }

  /**
   * Validate the construct before applying the mixin.
   * Returns validation errors if the construct cannot be safely encrypted.
   */
  validate(construct: IConstruct): string[] {
    if (!this.supports(construct)) {
      return [];
    }

    const config = encryptionData[construct.cfnResourceType as keyof typeof encryptionData];
    if (!config) {
      return [];
    }

    const errors: string[] = [];
    
    // Check if encryption is already configured
    const hasExistingEncryption = config.properties.some((prop: any) => {
      if (prop.purpose === 'enable-flag' || prop.purpose === 'kms-key-id' || prop.purpose === 'configuration') {
        const value = (construct as any)[prop.name];
        return value !== undefined && value !== null;
      }
      return false;
    });

    if (hasExistingEncryption) {
      errors.push(`${construct.cfnResourceType} already has encryption configured - applying mixin may overwrite existing settings`);
    }

    return errors;
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
    for (const [, props] of contexts) {
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
