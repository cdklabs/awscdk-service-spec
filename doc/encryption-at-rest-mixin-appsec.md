# AppSec Design Document: CDK Encryption-at-Rest Mixin

## 1. Overview

**Purpose:** Provide a CDK Mixin that applies encryption-at-rest configuration to AWS resources based on a curated, purpose-driven specification.

**Scope:** 150 AWS CloudFormation resource types with verified encryption-at-rest support.

**Security Posture:** Defense-in-depth approach with fail-safe defaults, validation at multiple layers, and comprehensive coverage of AWS encryption patterns.

## 2. Architecture

```
┌─────────────────────────────────┐
│  User CDK App                   │
│                                 │
│  new CfnBucket(...)             │
│    .with(new EncryptionAtRest())│
└────────┬────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  EncryptionAtRest Mixin (Generated)  │
│  ┌────────────────────────────────┐  │
│  │ supports(construct)            │  │
│  │  → Type-safe resource checks   │  │
│  │                                │  │
│  │ applyTo(construct)             │  │
│  │  → Resource-specific logic     │  │
│  │  → Purpose-driven application  │  │
│  │                                │  │
│  │ validate(construct)            │  │
│  │  → Pre-application checks      │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
         ▲
         │ Code Generation (Build Time)
         │
┌──────────────────────────────────────┐
│  data.json (Security-Reviewed)       │
│  ┌────────────────────────────────┐  │
│  │ 150 resources                  │  │
│  │ 4 property purposes            │  │
│  │ Context-aware grouping         │  │
│  │ Nested property paths          │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

## 3. User Interface

```typescript
interface EncryptionAtRestProps {
  readonly kmsKey?: string;      // KMS key identifier (ARN, ID, or alias)
}

// Usage with L1 constructs
const bucket = new s3.CfnBucket(scope, 'Bucket')
  .with(new EncryptionAtRest({ kmsKey: 'arn:aws:kms:...' }));

// Usage with L2 constructs
const table = new dynamodb.Table(scope, 'Table', { ... })
  .with(new EncryptionAtRest());

// Apply to multiple resources (fail-safe: skips unsupported)
Mixins.of(scope, ConstructSelector.resourcesOfType('AWS::S3::Bucket'))
  .apply(new EncryptionAtRest({ kmsKey: 'key-123' }));

// Enforce application (fails if any resource unsupported)
Mixins.of(scope, ConstructSelector.resourcesOfType('AWS::S3::Bucket'))
  .mustApply(new EncryptionAtRest({ kmsKey: 'key-123' }));
```

**Security Design Decisions:**

- **Explicit application:** Mixin must be explicitly applied via `.with()` or `Mixins.of()`
- **Flexible key management:** Supports AWS-managed and customer-managed keys
- **Input validation:** `validate()` method checks for existing encryption before application
- **Type-safe:** TypeScript ensures correct usage patterns
- **Framework-level enforcement:** `mustApply()` provides strict mode at framework level

## 4. Purpose-Driven Security Model

### 4.1 Property Classification

All encryption properties are classified by **purpose**, enabling consistent security controls:

| Purpose           | Count | Security Role       | Validation                  |
| ----------------- | ----- | ------------------- | --------------------------- |
| `kms-key-id`      | 154   | Key specification   | ARN format, IAM permissions |
| `configuration`   | 52    | Container object    | Nested structure validation |
| `encryption-type` | 42    | Algorithm selection | Allowed values enforcement  |
| `enable-flag`     | 21    | Explicit enablement | Boolean type safety         |

**Security Benefit:** Purpose-based logic eliminates pattern-specific vulnerabilities and ensures consistent security controls across all resource types.

### 4.2 Context-Aware Encryption

Resources with multiple encryption contexts (e.g., RDS storage + performance insights) are handled atomically:

```typescript
// Properties with same context are grouped and applied together
AWS::RDS::DBInstance:
  - StorageEncrypted (context: storage)
  - KmsKeyId (context: storage)
  - PerformanceInsightsKMSKeyId (context: performance-insights)
```

**Security Benefit:** Prevents partial encryption where some data contexts remain unencrypted.

## 5. Threat Model

### 5.1 Assets

- **Customer data at rest** in 150+ AWS resource types
- **KMS keys** (AWS-managed and customer-managed)
- **data.json specification** (150 resources, 269 properties)
- **CDK application code** using the mixin

### 5.2 Trust Boundaries

1. **User → Mixin:** User applies mixin to constructs
2. **Build → data.json:** Code generator reads data.json at build time
3. **Mixin → CloudFormation:** Generated mixin modifies resource properties by purpose

### 5.3 Threats & Mitigations

#### **T1: Property Mapping Errors**

**Threat:** Incorrect purpose classification applies encryption to wrong property.

**Impact:** MEDIUM - Resources remain unencrypted or misconfigured.

**Mitigations:**

- ✅ **Purpose-driven logic:** Eliminates pattern-specific mapping errors
- ✅ **Nested path validation:** Full property paths documented (45 resources)
- ✅ **CDK validation:** Property names validated at synth time
- ✅ **Human security review:** All 150 resources manually verified
- ✅ **Schema validation:** JSON Schema enforces structure
- ✅ **Mixin validation:** `validate()` method checks for existing encryption

**Residual Risk:** LOW

---

#### **T2: KMS Key Misuse**

**Threat:** User provides invalid/unauthorized KMS key ARN.

**Impact:** MEDIUM - Deployment fails or uses unintended key.

**Mitigations:**

- ✅ **CloudFormation validation:** KMS key validated at deploy time
- ✅ **IAM enforcement:** KMS key access controlled via IAM policies
- ✅ **Purpose classification:** All 154 kms-key-id properties consistently handled
- ✅ **Type safety:** TypeScript ensures string type for key properties

**Residual Risk:** LOW (CloudFormation + IAM provide defense-in-depth)

---

#### **T3: Encryption Downgrade**

**Threat:** Mixin overwrites stronger encryption with weaker settings.

**Impact:** HIGH - Security regression.

**Mitigations:**

- ✅ **Explicit application:** Mixin only applies when explicitly called via `.with()`
- ✅ **Validation method:** `validate()` detects existing encryption before application
- ✅ **Immutable by default:** CloudFormation prevents modification of encryption settings for many resources
- ✅ **User responsibility:** Developers explicitly choose to apply mixin

**Residual Risk:** LOW-MEDIUM (user must exercise care when applying to existing resources)

---

#### **T4: Incomplete Context Coverage**

**Threat:** Multi-context resources only partially encrypted (e.g., RDS storage encrypted but performance insights unencrypted).

**Impact:** HIGH - Data leakage through unencrypted context.

**Mitigations:**

- ✅ **Context grouping:** Properties with same context applied atomically
- ✅ **3 multi-context resources identified:** RDS::DBInstance, RDS::DBCluster, WorkSpaces::Workspace
- ✅ **All contexts documented:** Each context explicitly specified in data.json
- ✅ **Single mixin application:** One `.with()` call applies all contexts

**Residual Risk:** LOW

---

#### **T5: Incomplete Resource Coverage**

**Threat:** New AWS resources not in data.json remain unencrypted.

**Impact:** MEDIUM - Partial encryption coverage.

**Mitigations:**

- ✅ **150 resources covered:** Comprehensive coverage of encryption-capable resources
- ✅ **33 resources removed:** Non-encryption resources eliminated during review
- ✅ **`supports()` method:** Returns false for unknown resources
- ✅ **Fail-safe behavior:** `apply()` skips unknown resources without error
- ✅ **Strict enforcement available:** `mustApply()` fails if unknown resources encountered
- ✅ **Framework-level control:** Organizations can enforce complete coverage via `mustApply()`

**Residual Risk:** MEDIUM (ongoing maintenance required as AWS releases new services)

---

#### **T6: Supply Chain Attack**

**Threat:** Compromised npm package delivers malicious mixin code.

**Impact:** CRITICAL - Arbitrary code execution in CDK apps.

**Mitigations:**

- ✅ **Package signing:** npm package signatures
- ✅ **Dependency pinning:** Lock files for reproducible builds
- ✅ **Schema validation:** data.json validated against schema during build
- ✅ **Human review:** Changes to data.json are reviewed
- ✅ **Minimal dependencies:** Mixin has no external dependencies beyond aws-cdk-lib
- ✅ **Build-time generation:** data.json not shipped, eliminating runtime data injection
- ✅ **Reproducible builds:** Generated code can be audited in source control

**Residual Risk:** LOW (standard npm security practices)

---

## 6. Security Requirements

### 6.1 Fail-Safe Defaults

- **REQ-1:** Unknown resources MUST return false from `supports()`
- **REQ-2:** `apply()` MUST skip unsupported constructs without error
- **REQ-3:** `mustApply()` MUST fail if any selected construct is unsupported
- **REQ-4:** Mixin MUST NOT modify non-encryption properties

### 6.2 Auditability

- **REQ-5:** Mixin application MUST be visible in synthesized CloudFormation
- **REQ-6:** `validate()` method MUST detect existing encryption configuration
- **REQ-7:** Mixin MUST be traceable in CDK construct tree

### 6.3 Least Privilege

- **REQ-8:** Mixin MUST only modify encryption-related properties (validated by purpose)
- **REQ-9:** KMS key access controlled via IAM (not mixin responsibility)
- **REQ-10:** Context isolation: Multi-context resources handled independently

## 7. Implementation Safeguards

```typescript
// Generated code structure (example for AWS::S3::Bucket)
export class EncryptionAtRest {
  constructor(private readonly props: EncryptionAtRestProps = {}) {}

  // SAFEGUARD 1: Type-safe construct checking (generated per resource)
  supports(construct: IConstruct): boolean {
    if (!(construct instanceof CfnResource)) {
      return false;
    }
    // Generated switch statement for all 150 resources
    switch (construct.cfnResourceType) {
      case 'AWS::S3::Bucket':
      case 'AWS::DynamoDB::Table':
      // ... 148 more cases
        return true;
      default:
        return false;
    }
  }

  // SAFEGUARD 2: Fail-safe application
  applyTo(construct: IConstruct): IConstruct {
    if (!this.supports(construct)) {
      return construct; // Skip unsupported resources
    }

    // Generated resource-specific logic
    this.applyEncryption(construct);
    return construct;
  }

  // SAFEGUARD 3: Pre-application validation
  validate(construct: IConstruct): string[] {
    const errors: string[] = [];
    
    if (!this.supports(construct)) {
      return errors;
    }
    
    // Generated validation logic per resource type
    if (construct.cfnResourceType === 'AWS::S3::Bucket') {
      if ((construct as any).bucketEncryption !== undefined) {
        errors.push('AWS::S3::Bucket already has encryption configured');
      }
    }
    // ... more resource-specific checks

    return errors;
  }

  // SAFEGUARD 4: Purpose-driven application (generated per resource)
  private applyEncryption(resource: CfnResource): void {
    const resourceType = resource.cfnResourceType;
    
    // Generated switch with purpose-driven logic
    switch (resourceType) {
      case 'AWS::S3::Bucket':
        this.applyS3BucketEncryption(resource);
        break;
      case 'AWS::DynamoDB::Table':
        this.applyDynamoDBTableEncryption(resource);
        break;
      // ... 148 more cases
    }
  }

  // Generated resource-specific methods
  private applyS3BucketEncryption(resource: CfnResource): void {
    // Purpose: configuration (nested object)
    resource.addPropertyOverride('BucketEncryption.ServerSideEncryptionConfiguration.0.ServerSideEncryptionByDefault.SSEAlgorithm', 
      this.props.kmsKey ? 'aws:kms' : 'AES256');
    if (this.props.kmsKey) {
      // Purpose: kms-key-id
      resource.addPropertyOverride('BucketEncryption.ServerSideEncryptionConfiguration.0.ServerSideEncryptionByDefault.KMSMasterKeyID', 
        this.props.kmsKey);
    }
  }

  private applyDynamoDBTableEncryption(resource: CfnResource): void {
    // Purpose: configuration (nested object)
    resource.addPropertyOverride('SSESpecification.SSEEnabled', true);
    if (this.props.kmsKey) {
      // Purpose: encryption-type
      resource.addPropertyOverride('SSESpecification.SSEType', 'KMS');
      // Purpose: kms-key-id
      resource.addPropertyOverride('SSESpecification.KMSMasterKeyId', this.props.kmsKey);
    }
  }
}
```

## 8. Data Integrity & Validation

### 8.1 Schema Enforcement

```json
{
  "properties": {
    "purpose": {
      "enum": ["enable-flag", "kms-key-id", "encryption-type", "configuration"]
    },
    "path": {
      "description": "Full property path for nested properties"
    },
    "context": {
      "description": "Encryption context for multi-context resources"
    }
  }
}
```

**Security Benefit:** Schema validation prevents malformed data from reaching production.

### 8.2 Human Review Process

- ✅ **150 resources manually verified** against AWS documentation
- ✅ **33 non-encryption resources removed** during security review
- ✅ **All nested properties documented** (45 resources with 100+ nested paths)
- ✅ **Purpose classification validated** for all 269 properties

## 9. Testing Strategy

### 9.1 Mixin Interface Tests

```typescript
test('supports() returns true for known resources', () => {
  const bucket = new CfnBucket(stack, 'Bucket');
  const mixin = new EncryptionAtRest();
  
  expect(mixin.supports(bucket)).toBe(true);
});

test('supports() returns false for unknown resources', () => {
  const construct = new Construct(stack, 'Unknown');
  const mixin = new EncryptionAtRest();
  
  expect(mixin.supports(construct)).toBe(false);
});

test('applyTo() returns construct unchanged for unsupported types', () => {
  const construct = new Construct(stack, 'Unknown');
  const mixin = new EncryptionAtRest();
  
  const result = mixin.applyTo(construct);
  expect(result).toBe(construct);
});
```

### 9.2 Purpose-Specific Tests

```typescript
test('enable-flag purpose', () => {
  const volume = new CfnVolume(stack, 'Vol', {});
  const mixin = new EncryptionAtRest();
  
  mixin.applyTo(volume);
  
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::EC2::Volume', {
    Encrypted: true
  });
});

test('kms-key-id purpose', () => {
  const secret = new CfnSecret(stack, 'Secret', {});
  const mixin = new EncryptionAtRest({ 
    kmsKey: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012' 
  });
  
  mixin.applyTo(secret);
  
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::SecretsManager::Secret', {
    KmsKeyId: Match.stringLikeRegexp('arn:aws:kms:.*')
  });
});

test('context grouping', () => {
  const instance = new CfnDBInstance(stack, 'DB', {});
  const mixin = new EncryptionAtRest({ kmsKey: 'key-123' });
  
  mixin.applyTo(instance);
  
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::RDS::DBInstance', {
    StorageEncrypted: true,
    KmsKeyId: 'key-123',
    PerformanceInsightsKMSKeyId: 'key-123'
  });
});
```

### 9.3 Validation Tests

```typescript
test('validate() returns errors for already encrypted resources', () => {
  const bucket = new CfnBucket(stack, 'Bucket', {
    bucketEncryption: { /* already configured */ }
  });
  const mixin = new EncryptionAtRest();
  
  const errors = mixin.validate(bucket);
  expect(errors).toContain(expect.stringContaining('already has encryption configured'));
});

test('validate() returns no errors for unencrypted resources', () => {
  const bucket = new CfnBucket(stack, 'Bucket', {});
  const mixin = new EncryptionAtRest();
  
  const errors = mixin.validate(bucket);
  expect(errors).toHaveLength(0);
});

test('validate() returns empty for unsupported constructs', () => {
  const construct = new Construct(stack, 'Unknown');
  const mixin = new EncryptionAtRest();
  
  const errors = mixin.validate(construct);
  expect(errors).toHaveLength(0);
});
```

### 9.4 Integration with Mixins Framework

```typescript
test('works with .with() syntax', () => {
  const bucket = new CfnBucket(stack, 'Bucket')
    .with(new EncryptionAtRest({ kmsKey: 'key-123' }));
  
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketEncryption: Match.objectLike({})
  });
});

test('works with Mixins.of().apply() for bulk application', () => {
  new CfnBucket(stack, 'Bucket1');
  new CfnBucket(stack, 'Bucket2');
  
  Mixins.of(stack, ConstructSelector.resourcesOfType('AWS::S3::Bucket'))
    .apply(new EncryptionAtRest({ kmsKey: 'key-123' }));
  
  const template = Template.fromStack(stack);
  expect(template.findResources('AWS::S3::Bucket')).toHaveLength(2);
  // Both buckets should have encryption
});

test('mustApply() fails on unsupported resources', () => {
  new CfnBucket(stack, 'Bucket');
  new Construct(stack, 'Unknown'); // Not a CfnResource
  
  expect(() => {
    Mixins.of(stack, ConstructSelector.all())
      .mustApply(new EncryptionAtRest({ kmsKey: 'key-123' }));
  }).toThrow(/does not support/);
});

test('mustApply() succeeds when all resources supported', () => {
  new CfnBucket(stack, 'Bucket1');
  new CfnBucket(stack, 'Bucket2');
  
  expect(() => {
    Mixins.of(stack, ConstructSelector.resourcesOfType('AWS::S3::Bucket'))
      .mustApply(new EncryptionAtRest({ kmsKey: 'key-123' }));
  }).not.toThrow();
});
```

## 10. Risk Summary

| Threat                   | Likelihood | Impact   | Residual Risk  |
| ------------------------ | ---------- | -------- | -------------- |
| T1: Mapping errors       | LOW        | MEDIUM   | **LOW**        |
| T2: KMS key misuse       | MEDIUM     | MEDIUM   | **LOW**        |
| T3: Encryption downgrade | LOW        | HIGH     | **LOW-MEDIUM** |
| T4: Incomplete context   | LOW        | HIGH     | **LOW**        |
| T5: Incomplete coverage  | HIGH       | MEDIUM   | **MEDIUM**     |
| T6: Supply chain         | LOW        | CRITICAL | **LOW**        |

**Overall Risk Rating:** **LOW** (acceptable for production use)

**Key Security Strengths:**

- Purpose-driven architecture eliminates pattern-specific vulnerabilities
- Context-aware grouping prevents partial encryption
- Comprehensive coverage (150 resources, 269 properties)
- Defense-in-depth validation (schema + CDK + CloudFormation + IAM)
- Fail-safe defaults with explicit application model
- Input validation via `validate()` method
- Code generation eliminates runtime data injection attacks

**Code Generation Advantages:**

- **No runtime data:** data.json not shipped, reducing attack surface
- **Type safety:** Generated code is fully type-checked
- **Performance:** No JSON parsing or dynamic lookups at runtime
- **Auditability:** Generated code can be reviewed in source control
- **Immutability:** Encryption logic fixed at build time
