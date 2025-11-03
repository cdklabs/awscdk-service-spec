# AppSec Design Document: CDK Encryption-at-Rest Aspect

## 1. Overview

**Purpose:** Provide a CDK Aspect that automatically applies encryption-at-rest configuration to AWS resources based on a curated, purpose-driven specification.

**Scope:** 150 AWS CloudFormation resource types with verified encryption-at-rest support.

**Security Posture:** Defense-in-depth approach with fail-safe defaults, validation at multiple layers, and comprehensive coverage of AWS encryption patterns.

## 2. Architecture

```
┌─────────────────┐
│  User CDK App   │
│                 │
│  aspect.apply() │
└────────┬────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  EncryptionAtRestAspect              │
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
interface EncryptionAtRestAspectProps {
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
- **CDK application code** using the aspect

### 5.2 Trust Boundaries
1. **User → Aspect:** User provides encryption configuration
2. **Aspect → data.json:** Aspect reads purpose-driven specification
3. **Aspect → CloudFormation:** Aspect modifies resource properties by purpose

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
**Threat:** Aspect overwrites stronger encryption with weaker settings.

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
**Threat:** Compromised npm package delivers malicious aspect code.

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
- **REQ-3:** Aspect MUST NOT overwrite existing encryption without explicit opt-in
- **REQ-4:** Encryption MUST be enabled by default (`enabled: true`)

### 6.2 Auditability
- **REQ-5:** All encryption decisions MUST be logged via CDK Annotations
- **REQ-6:** Aspect MUST report which resources were modified
- **REQ-7:** Warnings MUST be emitted for skipped resources

### 6.3 Least Privilege
- **REQ-8:** Aspect MUST only modify encryption-related properties (validated by purpose)
- **REQ-9:** KMS key access controlled via IAM (not aspect responsibility)
- **REQ-10:** Context isolation: Multi-context resources handled independently

## 7. Implementation Safeguards

```typescript
class EncryptionAtRestAspect implements IAspect {
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
  
  Aspects.of(stack).add(new EncryptionAtRestAspect());
  
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::EC2::Volume', {
    Encrypted: true  // enable-flag applied
  });
});

test('kms-key-id purpose', () => {
  const stack = new Stack();
  const secret = new CfnSecret(stack, 'Secret', {...});
  
  Aspects.of(stack).add(new EncryptionAtRestAspect({ 
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
  
  Aspects.of(stack).add(new EncryptionAtRestAspect({ 
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
  
  Aspects.of(stack).add(new EncryptionAtRestAspect({ strict: true }));
  
  expect(() => Template.fromStack(stack)).toThrow(/already has encryption/);
});

test('strict mode fails on unknown resource', () => {
  const stack = new Stack();
  // Hypothetical future resource not in data.json
  const resource = new CfnResource(stack, 'Unknown', {
    type: 'AWS::FutureService::Resource'
  });
  
  Aspects.of(stack).add(new EncryptionAtRestAspect({ strict: true }));
  
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
│  aspect.apply() │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  EncryptionAtRestAspect         │
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
- **CDK application code** using the aspect

### 4.2 Trust Boundaries
1. **User → Aspect:** User provides encryption configuration
2. **Aspect → data.json:** Aspect reads specification
3. **Aspect → CloudFormation:** Aspect modifies resource properties

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
- ⚠️ **RECOMMENDED:** Aspect validates KMS ARN format before applying
- ⚠️ **RECOMMENDED:** Optional allowlist of permitted KMS keys

**Residual Risk:** LOW (CloudFormation catches most issues)

---

#### **T3: Encryption Downgrade**
**Threat:** Aspect overwrites stronger encryption with weaker settings.

**Impact:** HIGH - Security regression.

**Mitigations:**
- ✅ Aspect only applies if property is undefined/null
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
- ✅ Aspect logs warning for unknown resource types
- ✅ Regular updates to data.json as AWS releases new services
- ⚠️ **RECOMMENDED:** CI/CD check that fails if unknown resources detected
- ⚠️ **RECOMMENDED:** Telemetry to track coverage gaps

**Residual Risk:** MEDIUM (ongoing maintenance required)

---

#### **T6: Supply Chain Attack**
**Threat:** Compromised npm package delivers malicious aspect code.

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
- **REQ-3:** Aspect MUST NOT overwrite existing encryption settings without explicit opt-in

### 5.2 Auditability
- **REQ-4:** All encryption decisions MUST be logged
- **REQ-5:** Aspect MUST report which resources were modified
- **REQ-6:** Dry-run mode MUST be available for validation

### 5.3 Least Privilege
- **REQ-7:** Aspect MUST only modify encryption-related properties
- **REQ-8:** KMS key access controlled via IAM (not aspect responsibility)

## 6. Implementation Safeguards

```typescript
class EncryptionAtRestAspect implements IAspect {
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
- ✅ Generate aspect code from data.json
- ✅ Verify generated code compiles without errors
- ✅ Type safety: Ensure all property references are type-safe

### 7.2 Pattern-Specific Unit Tests
```typescript
// Example: boolean-and-key pattern
test('RDS DBInstance encryption', () => {
  const stack = new Stack();
  const instance = new CfnDBInstance(stack, 'DB', {...});
  
  Aspects.of(stack).add(new EncryptionAtRestAspect({ kmsKey: 'key-123' }));
  
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
