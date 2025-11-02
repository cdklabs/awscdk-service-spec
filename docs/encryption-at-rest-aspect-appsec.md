# AppSec Design Document: CDK Encryption-at-Rest Aspect

## 1. Overview

**Purpose:** Provide a CDK Aspect that automatically applies encryption-at-rest configuration to AWS resources based on a curated specification.

**Scope:** ~200 AWS CloudFormation resource types supporting encryption at rest.

## 2. Architecture

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

| Threat | Likelihood | Impact | Residual Risk |
|--------|-----------|--------|---------------|
| T1: Mapping errors | LOW | MEDIUM | LOW |
| T2: KMS key misuse | MEDIUM | MEDIUM | LOW |
| T3: Encryption downgrade | LOW | HIGH | LOW |
| T4: Pattern errors | LOW | MEDIUM | LOW |
| T5: Incomplete coverage | HIGH | MEDIUM | MEDIUM |
| T6: Supply chain | LOW | CRITICAL | LOW |

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
