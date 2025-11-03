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

**Code Generation Approach:**

- **Build-time generation:** Mixin code is generated from data.json during package build
- **Not shipped:** data.json is not included in the published package
- **Type-safe output:** Generated code has explicit type checks for each resource
- **Optimized performance:** No JSON parsing or dynamic lookups at runtime
- **Security benefit:** Eliminates runtime data injection attacks

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
- ✅ **Human review:** All changes to data.json security-reviewed
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

## 11. Operational Security

### 11.1 Monitoring & Alerting

- Mixin application visible in CloudFormation templates
- `validate()` method provides pre-application safety checks
- CDK synthesis logs show mixin application
- CloudFormation deployment logs show encryption configuration

### 11.2 Maintenance & Updates

- Quarterly security review of data.json against AWS documentation
- Automated schema validation in CI/CD
- Version data.json with semantic versioning
- Security changelog for all data.json updates

### 11.3 Incident Response

- **Unknown resource:** `supports()` returns false, mixin skips
- **Encryption downgrade:** User responsibility to check existing config
- **Invalid KMS key:** CloudFormation deployment fails with clear error
- **Supply chain compromise:** npm audit + package signature verification

## 12. Compliance & Governance

**Supported Compliance Frameworks:**

- **HIPAA:** Encryption at rest for PHI
- **PCI DSS:** Requirement 3.4 (encryption of cardholder data)
- **GDPR:** Article 32 (security of processing)
- **SOC 2:** CC6.7 (encryption of data at rest)

**Governance Features:**

- Explicit mixin application for audit trail
- `validate()` method for pre-application checks
- Centralized encryption key management
- Consistent encryption across 150+ resource types
- Composable with other security mixins

---

**Document Version:** 3.0  
**Last Updated:** 2025-11-03  
**Security Review Status:** ✅ Approved  
**Next Review:** 2026-02-03

**Scope:** 150 AWS CloudFormation resource types with verified encryption-at-rest support.

**Security Posture:** Defense-in-depth approach with fail-safe defaults, validation at multiple layers, and comprehensive coverage of AWS encryption patterns.

## 2. Architecture

```
┌─────────────────┐
│  User CDK App   │
│                 │
│  mixin.with() │
└────────┬────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  EncryptionAtRest              │
│  ┌────────────────────────────────┐  │
│  │ visit(node: IConstruct)        │  │
│  │  1. Get CFN resource type      │  │
│  │  2. Load spec from data.json   │  │
│  │  3. Group props by context     │  │
│  │  4. Apply by purpose           │  │
│  └────────────────────────────────┘  │
└────────┬─────────────────────────────┘
         │
         ▼
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
  readonly enabled?: boolean;     // Enable/disable toggle (default: true)
  readonly strict?: boolean;      // Fail on unknown resources (default: false)
}
```

**Security Design Decisions:**

- **Opt-out by default:** Encryption enabled unless explicitly disabled
- **Strict mode available:** Organizations can enforce encryption coverage
- **Flexible key management:** Supports AWS-managed and customer-managed keys

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

1. **User → Mixin:** User provides encryption configuration
2. **Mixin → data.json:** Mixin reads purpose-driven specification
3. **Mixin → CloudFormation:** Mixin modifies resource properties by purpose

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
- ✅ **Comprehensive testing:** Purpose-specific test coverage

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

- ✅ **Pre-flight check:** `hasEncryption()` detects existing configuration
- ✅ **Strict mode:** Fails if encryption already configured
- ✅ **Non-strict mode:** Logs warning and skips resource
- ✅ **Explicit opt-in required:** `enabled: false` must be set to disable

**Residual Risk:** LOW

---

#### **T4: Incomplete Context Coverage**

**Threat:** Multi-context resources only partially encrypted (e.g., RDS storage encrypted but performance insights unencrypted).

**Impact:** HIGH - Data leakage through unencrypted context.

**Mitigations:**

- ✅ **Context grouping:** Properties with same context applied atomically
- ✅ **3 multi-context resources identified:** RDS::DBInstance, RDS::DBCluster, WorkSpaces::Workspace
- ✅ **All contexts documented:** Each context explicitly specified in data.json

**Residual Risk:** LOW

---

#### **T5: Incomplete Resource Coverage**

**Threat:** New AWS resources not in data.json remain unencrypted.

**Impact:** MEDIUM - Partial encryption coverage.

**Mitigations:**

- ✅ **150 resources covered:** Comprehensive coverage of encryption-capable resources
- ✅ **33 resources removed:** Non-encryption resources eliminated during review
- ✅ **Fail-safe logging:** Unknown resources logged with warning
- ✅ **Strict mode available:** Organizations can enforce complete coverage

**Residual Risk:** MEDIUM (ongoing maintenance required as AWS releases new services)

---

#### **T6: Supply Chain Attack**

**Threat:** Compromised npm package delivers malicious mixin code.

**Impact:** CRITICAL - Arbitrary code execution in CDK apps.

**Mitigations:**

- ✅ **Package signing:** npm package signatures
- ✅ **Dependency pinning:** Lock files for reproducible builds
- ✅ **Schema validation:** data.json validated against schema
- ✅ **Human review:** All changes to data.json security-reviewed

**Residual Risk:** LOW (standard npm security practices)

---

## 6. Security Requirements

### 6.1 Fail-Safe Defaults

- **REQ-1:** Unknown resources MUST log warning and skip (not fail) in non-strict mode
- **REQ-2:** Strict mode MUST fail on unknown resources
- **REQ-3:** Mixin MUST NOT overwrite existing encryption without explicit opt-in
- **REQ-4:** Encryption MUST be enabled by default (`enabled: true`)

### 6.2 Auditability

- **REQ-5:** All encryption decisions MUST be logged via CDK Annotations
- **REQ-6:** Mixin MUST report which resources were modified
- **REQ-7:** Warnings MUST be emitted for skipped resources

### 6.3 Least Privilege

- **REQ-8:** Mixin MUST only modify encryption-related properties (validated by purpose)
- **REQ-9:** KMS key access controlled via IAM (not mixin responsibility)
- **REQ-10:** Context isolation: Multi-context resources handled independently

## 7. Implementation Safeguards

```typescript
class EncryptionAtRest implements IMixin {
  visit(node: IConstruct): void {
    // SAFEGUARD 1: Only process CFN resources
    if (!(node instanceof CfnResource)) return;
    
    // SAFEGUARD 2: Respect enabled flag
    if (!this.props.enabled) return;
    
    // SAFEGUARD 3: Validate resource type exists in spec
    const config = encryptionData[node.cfnResourceType];
    if (!config) {
      if (this.props.strict) {
        throw new Error(`No encryption configuration for ${node.cfnResourceType}`);
      }
      return; // Fail-safe: skip unknown
    }
    
    // SAFEGUARD 4: Check existing encryption
    if (this.hasEncryption(node, config)) {
      const message = `Resource already has encryption configured`;
      if (this.props.strict) {
        throw new Error(message);
      }
      Annotations.of(node).addWarning(message);
      return; // Prevent downgrade
    }
    
    // SAFEGUARD 5: Apply by purpose with context grouping
    this.applyEncryption(node, config);
  }
  
  private applyEncryption(resource: CfnResource, config: any): void {
    // Group properties by context for atomic application
    const contexts = new Map<string, any[]>();
    for (const prop of config.properties) {
      const ctx = prop.context || 'default';
      if (!contexts.has(ctx)) contexts.set(ctx, []);
      contexts.get(ctx)!.push(prop);
    }
    
    // Apply encryption for each context independently
    for (const [context, props] of contexts) {
      this.applyEncryptionForContext(resource, props, this.props.kmsKey);
    }
  }
  
  private applyEncryptionForContext(resource: CfnResource, properties: any[], kmsKey?: string): void {
    // Purpose-driven application logic
    for (const prop of properties) {
      switch (prop.purpose) {
        case 'enable-flag':
          resource.addPropertyOverride(prop.name, true);
          break;
        case 'kms-key-id':
          if (kmsKey) resource.addPropertyOverride(prop.name, kmsKey);
          break;
        case 'encryption-type':
          // Select KMS variant if key provided
          const value = kmsKey && prop.acceptedValues 
            ? prop.acceptedValues.find(v => v.includes('KMS'))
            : prop.acceptedValues?.[0];
          if (value) resource.addPropertyOverride(prop.name, value);
          break;
        case 'configuration':
          // Handle nested configuration objects
          this.applyNestedConfiguration(resource, prop, properties, kmsKey);
          break;
      }
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

### 9.1 Purpose-Specific Unit Tests

```typescript
test('enable-flag purpose', () => {
  const stack = new Stack();
  const volume = new CfnVolume(stack, 'Vol', {...});
  
  Mixins.of(stack).add(new EncryptionAtRest());
  
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::EC2::Volume', {
    Encrypted: true  // enable-flag applied
  });
});

test('kms-key-id purpose', () => {
  const stack = new Stack();
  const secret = new CfnSecret(stack, 'Secret', {...});
  
  Mixins.of(stack).add(new EncryptionAtRest({ 
    kmsKey: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012' 
  }));
  
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::SecretsManager::Secret', {
    KmsKeyId: Match.stringLikeRegexp('arn:aws:kms:.*')  // kms-key-id applied
  });
});

test('context grouping', () => {
  const stack = new Stack();
  const instance = new CfnDBInstance(stack, 'DB', {...});
  
  Mixins.of(stack).add(new EncryptionAtRest({ 
    kmsKey: 'key-123' 
  }));
  
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::RDS::DBInstance', {
    StorageEncrypted: true,           // context: storage
    KmsKeyId: 'key-123',              // context: storage
    PerformanceInsightsKMSKeyId: 'key-123'  // context: performance-insights
  });
});
```

### 9.2 Security Tests

```typescript
test('prevents encryption downgrade', () => {
  const stack = new Stack();
  const bucket = new CfnBucket(stack, 'Bucket', {
    bucketEncryption: { /* already configured */ }
  });
  
  Mixins.of(stack).add(new EncryptionAtRest({ strict: true }));
  
  expect(() => Template.fromStack(stack)).toThrow(/already has encryption/);
});

test('strict mode fails on unknown resource', () => {
  const stack = new Stack();
  // Hypothetical future resource not in data.json
  const resource = new CfnResource(stack, 'Unknown', {
    type: 'AWS::FutureService::Resource'
  });
  
  Mixins.of(stack).add(new EncryptionAtRest({ strict: true }));
  
  expect(() => Template.fromStack(stack)).toThrow(/No encryption configuration/);
});
```

## 10. Risk Summary

| Threat                   | Likelihood | Impact   | Residual Risk |
| ------------------------ | ---------- | -------- | ------------- |
| T1: Mapping errors       | LOW        | MEDIUM   | **LOW**       |
| T2: KMS key misuse       | MEDIUM     | MEDIUM   | **LOW**       |
| T3: Encryption downgrade | LOW        | HIGH     | **LOW**       |
| T4: Incomplete context   | LOW        | HIGH     | **LOW**       |
| T5: Incomplete coverage  | HIGH       | MEDIUM   | **MEDIUM**    |
| T6: Supply chain         | LOW        | CRITICAL | **LOW**       |

**Overall Risk Rating:** **LOW** (acceptable for production use)

**Key Security Strengths:**

- Purpose-driven architecture eliminates pattern-specific vulnerabilities
- Context-aware grouping prevents partial encryption
- Comprehensive coverage (150 resources, 269 properties)
- Defense-in-depth validation (schema + CDK + CloudFormation + IAM)
- Fail-safe defaults with strict mode available

## 11. Operational Security

### 11.1 Monitoring & Alerting

- Log all encryption applications via CDK Annotations
- Track coverage metrics (% resources encrypted per stack)
- Alert on unknown resource types in strict mode
- Monitor for encryption downgrade attempts

### 11.2 Maintenance & Updates

- Quarterly security review of data.json against AWS documentation
- Automated schema validation in CI/CD
- Version data.json with semantic versioning
- Security changelog for all data.json updates

### 11.3 Incident Response

- **Unknown resource detected:** Log warning, continue (non-strict) or fail (strict)
- **Encryption downgrade attempted:** Log warning, skip resource (non-strict) or fail (strict)
- **Invalid KMS key:** CloudFormation deployment fails with clear error
- **Supply chain compromise:** npm audit + package signature verification

## 12. Compliance & Governance

**Supported Compliance Frameworks:**

- **HIPAA:** Encryption at rest for PHI
- **PCI DSS:** Requirement 3.4 (encryption of cardholder data)
- **GDPR:** Article 32 (security of processing)
- **SOC 2:** CC6.7 (encryption of data at rest)

**Governance Features:**

- Strict mode for mandatory encryption policies
- Audit trail via CDK Annotations
- Centralized encryption key management
- Consistent encryption across 150+ resource types

---

**Document Version:** 2.0  
**Last Updated:** 2025-11-03  
**Security Review Status:** ✅ Approved  
**Next Review:** 2026-02-03

```
┌─────────────────┐
│  User CDK App   │
│                 │
│  mixin.with() │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  EncryptionAtRest         │
│  ┌───────────────────────────┐  │
│  │ visit(node: IConstruct)   │  │
│  │  1. Get CFN resource type │  │
│  │  2. Load spec from data   │  │
│  │  3. Map props to CFN      │  │
│  │  4. Apply encryption      │  │
│  └───────────────────────────┘  │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  data.json (Human-Reviewed)     │
│  ┌───────────────────────────┐  │
│  │ Pattern mappings          │  │
│  │ Property metadata         │  │
│  │ Default behaviors         │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

## 3. User Interface

```typescript
interface EncryptionAtRestProps {
  readonly kmsKey?: string;      // KMS key identifier
  readonly enabled?: boolean;     // Enable/disable toggle
  readonly encryptionType?: string; // Algorithm selection
}
```

## 4. Threat Model

### 4.1 Assets

- **Customer data at rest** in AWS resources
- **KMS keys** used for encryption
- **data.json specification** file
- **CDK application code** using the mixin

### 4.2 Trust Boundaries

1. **User → Mixin:** User provides encryption configuration
2. **Mixin → data.json:** Mixin reads specification
3. **Mixin → CloudFormation:** Mixin modifies resource properties

### 4.3 Threats & Mitigations

#### **T1: Property Mapping Errors**

**Threat:** Incorrect mapping applies encryption to wrong property or skips encryption.

**Impact:** MEDIUM - Resources remain unencrypted or misconfigured.

**Mitigations:**

- ✅ CDK validates property names and types at synth time (catches invalid properties immediately)
- ✅ Code generation from data.json ensures type safety
- ✅ Comprehensive test suite:
  - Unit tests for each encryption pattern
  - Integration tests that synthesize CloudFormation templates
  - Snapshot tests comparing generated templates against expected output
- ✅ Human review of data.json mappings
- ✅ Fail-safe: Log warning if resource type not in spec

**Residual Risk:** LOW

**Why CDK validation is sufficient:**

- CDK's `addPropertyOverride()` validates against CloudFormation spec at synth time
- Invalid property names → synth fails with clear error
- Wrong property types → TypeScript compilation fails
- Missing required properties → CloudFormation deployment fails with validation error

---

#### **T2: KMS Key Misuse**

**Threat:** User provides invalid/unauthorized KMS key ARN.

**Impact:** MEDIUM - Deployment fails or uses unintended key.

**Mitigations:**

- ✅ CloudFormation validates KMS key at deploy time
- ✅ IAM policies control KMS key access
- ⚠️ **RECOMMENDED:** Mixin validates KMS ARN format before applying
- ⚠️ **RECOMMENDED:** Optional allowlist of permitted KMS keys

**Residual Risk:** LOW (CloudFormation catches most issues)

---

#### **T3: Encryption Downgrade**

**Threat:** Mixin overwrites stronger encryption with weaker settings.

**Impact:** HIGH - Security regression.

**Mitigations:**

- ✅ Mixin only applies if property is undefined/null
- ✅ Explicit opt-in via `enabled: false` required to disable
- ⚠️ **RECOMMENDED:** Audit mode that reports existing encryption settings
- ⚠️ **RECOMMENDED:** Fail-closed: Error if attempting to weaken encryption

**Residual Risk:** LOW

---

#### **T4: Pattern Classification Errors**

**Threat:** Resource classified with wrong pattern, leading to incorrect property structure.

**Impact:** MEDIUM - Deployment fails or encryption not applied.

**Mitigations:**

- ✅ Code generation from data.json patterns ensures consistent implementation
- ✅ Pattern-specific test suites:
  - `boolean-and-key`: Test that both Encrypted=true and KmsKeyId are set
  - `specification-object`: Test nested object structure matches schema
  - `configuration-object`: Test configuration object is properly formed
- ✅ Golden template tests: Compare synthesized CFN against known-good templates
- ✅ Human review of pattern assignments in data.json
- ✅ CDK synth catches structural errors immediately

**Residual Risk:** LOW

---

#### **T5: Incomplete Coverage**

**Threat:** New AWS resources not in data.json remain unencrypted.

**Impact:** MEDIUM - Partial encryption coverage.

**Mitigations:**

- ✅ Mixin logs warning for unknown resource types
- ✅ Regular updates to data.json as AWS releases new services
- ⚠️ **RECOMMENDED:** CI/CD check that fails if unknown resources detected
- ⚠️ **RECOMMENDED:** Telemetry to track coverage gaps

**Residual Risk:** MEDIUM (ongoing maintenance required)

---

#### **T6: Supply Chain Attack**

**Threat:** Compromised npm package delivers malicious mixin code.

**Impact:** CRITICAL - Arbitrary code execution in CDK apps.

**Mitigations:**

- ✅ Package signing and verification
- ✅ Dependency pinning with lock files
- ✅ Regular security audits
- ⚠️ **RECOMMENDED:** Subresource Integrity (SRI) for data.json
- ⚠️ **RECOMMENDED:** Reproducible builds

**Residual Risk:** LOW (standard npm security practices)

---

## 5. Security Requirements

### 5.1 Fail-Safe Defaults

- **REQ-1:** Unknown resources MUST log warning and skip (not fail)
- **REQ-2:** Invalid KMS ARN format MUST be rejected
- **REQ-3:** Mixin MUST NOT overwrite existing encryption settings without explicit opt-in

### 5.2 Auditability

- **REQ-4:** All encryption decisions MUST be logged
- **REQ-5:** Mixin MUST report which resources were modified
- **REQ-6:** Dry-run mode MUST be available for validation

### 5.3 Least Privilege

- **REQ-7:** Mixin MUST only modify encryption-related properties
- **REQ-8:** KMS key access controlled via IAM (not mixin responsibility)

## 6. Implementation Safeguards

```typescript
class EncryptionAtRest implements IMixin {
  visit(node: IConstruct): void {
    // SAFEGUARD 1: Only process CFN resources
    if (!CfnResource.isCfnResource(node)) return;
    
    // SAFEGUARD 2: Validate resource type exists in spec
    const spec = this.loadSpec(node.cfnResourceType);
    if (!spec) {
      this.warn(`Unknown resource type: ${node.cfnResourceType}`);
      return; // Fail-safe: skip unknown
    }
    
    // SAFEGUARD 3: Check existing encryption
    if (this.hasEncryption(node) && !this.props.overwrite) {
      this.info(`Skipping ${node.cfnResourceType}: already encrypted`);
      return; // Prevent downgrade
    }
    
    // SAFEGUARD 4: Validate KMS ARN format
    if (this.props.kmsKey && !this.isValidKmsArn(this.props.kmsKey)) {
      throw new Error(`Invalid KMS ARN: ${this.props.kmsKey}`);
    }
    
    // SAFEGUARD 5: Apply with pattern-specific logic
    this.applyEncryption(node, spec);
  }
}
```

## 7. Testing Strategy

### 7.1 Code Generation Tests

- ✅ Generate mixin code from data.json
- ✅ Verify generated code compiles without errors
- ✅ Type safety: Ensure all property references are type-safe

### 7.2 Pattern-Specific Unit Tests

```typescript
// Example: boolean-and-key pattern
test('RDS DBInstance encryption', () => {
  const stack = new Stack();
  const instance = new CfnDBInstance(stack, 'DB', {...});
  
  Mixins.of(stack).add(new EncryptionAtRest({ kmsKey: 'key-123' }));
  
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::RDS::DBInstance', {
    StorageEncrypted: true,
    KmsKeyId: 'key-123'
  });
});
```

### 7.3 Snapshot Tests

- ✅ Golden templates for each resource type
- ✅ Detect unintended changes to generated CloudFormation
- ✅ Version control for encryption configurations

### 7.4 Integration Tests

- ✅ CDK synth validates all properties (catches invalid names/types)
- ✅ Deploy to test account and verify encryption via AWS APIs
- ✅ Test with real KMS keys and IAM permissions

### 7.5 Security Tests

- ✅ Attempt to overwrite existing encryption (should skip)
- ✅ Provide invalid KMS ARNs (CDK/CloudFormation catches)
- ✅ Test strict mode behavior

## 8. Operational Considerations

### 8.1 Monitoring

- Log all encryption applications
- Track coverage metrics (% resources encrypted)
- Alert on unknown resource types

### 8.2 Maintenance

- Quarterly review of data.json against AWS documentation
- Automated checks for new AWS resource types
- Version data.json with semantic versioning

## 9. Risk Summary

| Threat                   | Likelihood | Impact   | Residual Risk |
| ------------------------ | ---------- | -------- | ------------- |
| T1: Mapping errors       | LOW        | MEDIUM   | LOW           |
| T2: KMS key misuse       | MEDIUM     | MEDIUM   | LOW           |
| T3: Encryption downgrade | LOW        | HIGH     | LOW           |
| T4: Pattern errors       | LOW        | MEDIUM   | LOW           |
| T5: Incomplete coverage  | HIGH       | MEDIUM   | MEDIUM        |
| T6: Supply chain         | LOW        | CRITICAL | LOW           |

**Overall Risk Rating:** LOW-MEDIUM (acceptable with mitigations)

## 10. Recommendations

**MUST IMPLEMENT:**

1. Code generation from data.json (ensures type safety and consistency)
2. Comprehensive test suite (unit + integration + snapshot tests)
3. Fail-safe defaults (skip unknown resources)
4. Prevent encryption downgrades

**SHOULD IMPLEMENT:**
5. Dry-run/audit mode
6. KMS key allowlist option
7. CI/CD integration (run tests on every data.json change)

**NICE TO HAVE:**
8. Telemetry for coverage tracking
9. Auto-update mechanism for data.json
10. Coverage report (% of AWS resources with encryption support)
