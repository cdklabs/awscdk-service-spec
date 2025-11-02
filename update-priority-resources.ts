import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('sources/EncryptionAtRest/data.json', 'utf-8'));

// High-priority updates based on AWS documentation research
const updates: Record<string, any> = {
  'AWS::EC2::Volume': {
    pattern: 'boolean-and-key',
    properties: [
      { name: 'Encrypted', type: 'boolean', required: false, purpose: 'enable-flag' },
      { name: 'KmsKeyId', type: 'string', required: false, purpose: 'kms-key-id' }
    ],
    defaultBehavior: 'Depends on account encryption-by-default setting. If enabled, volumes are encrypted with default KMS key. If KmsKeyId is specified, Encrypted must be true.',
    notes: 'Encryption cannot be changed after volume creation. Supports key ID, alias, ARN, or alias ARN. Uses AWS managed key (alias/aws/ebs) if no key specified.'
  },
  'AWS::EC2::Instance': {
    pattern: 'multiple-contexts',
    properties: [
      { name: 'BlockDeviceMappings', type: 'object', required: false, purpose: 'configuration', context: 'ebs-volumes' }
    ],
    defaultBehavior: 'EBS volumes follow account encryption-by-default setting. Root and data volumes can be encrypted independently.',
    notes: 'Encryption configured per volume in BlockDeviceMappings. Each volume can have different encryption settings.'
  },
  'AWS::Lambda::Function': {
    pattern: 'unknown',
    properties: [
      { name: 'KmsKeyArn', type: 'string', required: false, purpose: 'kms-key-id', context: 'environment-variables' }
    ],
    defaultBehavior: 'Environment variables encrypted with AWS managed key by default.',
    notes: 'KmsKeyArn only applies to environment variable encryption, not function code or layers.'
  },
  'AWS::Kinesis::Stream': {
    pattern: 'specification-object',
    properties: [
      { name: 'StreamEncryption', type: 'object', required: false, purpose: 'configuration' }
    ],
    defaultBehavior: 'Not encrypted by default.',
    notes: 'Server-side encryption can be enabled with KMS. Encryption applies to data at rest in the stream.'
  },
  'AWS::SQS::Queue': {
    pattern: 'unknown',
    properties: [
      { name: 'KmsMasterKeyId', type: 'string', required: false, purpose: 'kms-key-id' },
      { name: 'SqsManagedSseEnabled', type: 'boolean', required: false, purpose: 'enable-flag' }
    ],
    defaultBehavior: 'SQS-managed encryption (SSE-SQS) enabled by default for new queues.',
    notes: 'Can use KMS (SSE-KMS) by specifying KmsMasterKeyId, or SQS-managed keys (SSE-SQS) with SqsManagedSseEnabled.'
  },
  'AWS::SNS::Topic': {
    pattern: 'unknown',
    properties: [
      { name: 'KmsMasterKeyId', type: 'string', required: false, purpose: 'kms-key-id' }
    ],
    defaultBehavior: 'Not encrypted by default.',
    notes: 'When KmsMasterKeyId is specified, messages are encrypted at rest using the specified KMS key.'
  },
  'AWS::ElastiCache::ReplicationGroup': {
    pattern: 'boolean-and-key',
    properties: [
      { name: 'AtRestEncryptionEnabled', type: 'boolean', required: false, purpose: 'enable-flag' },
      { name: 'KmsKeyId', type: 'string', required: false, purpose: 'kms-key-id' }
    ],
    defaultBehavior: 'Not encrypted by default. Uses AWS managed key if AtRestEncryptionEnabled is true but KmsKeyId not specified.',
    notes: 'Encryption cannot be changed after creation. Only available for Redis replication groups.'
  },
  'AWS::DAX::Cluster': {
    pattern: 'specification-object',
    properties: [
      { name: 'SSESpecification', type: 'object', required: false, purpose: 'configuration' }
    ],
    defaultBehavior: 'Not encrypted by default.',
    notes: 'Encryption at rest for DAX clusters. Cannot be modified after cluster creation.'
  },
  'AWS::Backup::BackupVault': {
    pattern: 'unknown',
    properties: [
      { name: 'EncryptionKeyArn', type: 'string', required: false, purpose: 'kms-key-id' }
    ],
    defaultBehavior: 'Uses AWS managed key if EncryptionKeyArn not specified.',
    notes: 'All backups in the vault are encrypted. Encryption key cannot be changed after vault creation.'
  },
  'AWS::Logs::LogGroup': {
    pattern: 'unknown',
    properties: [
      { name: 'KmsKeyId', type: 'string', required: false, purpose: 'kms-key-id' }
    ],
    defaultBehavior: 'Encrypted with AWS managed key by default.',
    notes: 'Can specify customer managed KMS key. Encryption applies to log data at rest.'
  },
  'AWS::Athena::WorkGroup': {
    pattern: 'configuration-object',
    properties: [
      { name: 'WorkGroupConfiguration', type: 'object', required: false, purpose: 'configuration' }
    ],
    defaultBehavior: 'Query results encrypted with S3 default encryption if not specified.',
    notes: 'Encryption configuration is part of WorkGroupConfiguration.ResultConfiguration.EncryptionConfiguration.'
  },
  'AWS::EMR::Cluster': {
    pattern: 'configuration-object',
    properties: [
      { name: 'KerberosAttributes', type: 'object', required: false, purpose: 'configuration' }
    ],
    defaultBehavior: 'Not encrypted by default.',
    notes: 'Supports encryption at rest, in transit, and for local disks. Configuration is complex with multiple encryption contexts.'
  },
  'AWS::EKS::Cluster': {
    pattern: 'configuration-object',
    properties: [
      { name: 'EncryptionConfig', type: 'object', required: false, purpose: 'configuration' }
    ],
    defaultBehavior: 'Secrets not encrypted with customer managed key by default.',
    notes: 'Enables envelope encryption of Kubernetes secrets using KMS. Cannot be changed after cluster creation.'
  },
  'AWS::DocDB::DBCluster': {
    pattern: 'boolean-and-key',
    properties: [
      { name: 'StorageEncrypted', type: 'boolean', required: false, purpose: 'enable-flag' },
      { name: 'KmsKeyId', type: 'string', required: false, purpose: 'kms-key-id' }
    ],
    defaultBehavior: 'Not encrypted by default. Uses AWS managed key if StorageEncrypted is true but KmsKeyId not specified.',
    notes: 'Encryption cannot be changed after cluster creation. Encrypts data at rest including underlying storage, backups, and snapshots.'
  },
  'AWS::Redshift::Cluster': {
    pattern: 'boolean-and-key',
    properties: [
      { name: 'Encrypted', type: 'boolean', required: false, purpose: 'enable-flag' },
      { name: 'KmsKeyId', type: 'string', required: false, purpose: 'kms-key-id' }
    ],
    defaultBehavior: 'Not encrypted by default. Uses AWS managed key if Encrypted is true but KmsKeyId not specified.',
    notes: 'Encryption can be changed after creation but requires cluster modification. Encrypts data blocks, system metadata, and snapshots.'
  },
  'AWS::CloudTrail::Trail': {
    pattern: 'unknown',
    properties: [
      { name: 'KMSKeyId', type: 'string', required: false, purpose: 'kms-key-id' }
    ],
    defaultBehavior: 'Log files encrypted with S3 server-side encryption by default.',
    notes: 'Can specify KMS key for additional encryption. CloudTrail must have permissions to use the key.'
  },
  'AWS::SecretsManager::Secret': {
    pattern: 'unknown',
    properties: [
      { name: 'KmsKeyId', type: 'string', required: false, purpose: 'kms-key-id' }
    ],
    defaultBehavior: 'Encrypted with AWS managed key (aws/secretsmanager) by default.',
    notes: 'Can specify customer managed KMS key. Encryption key can be changed after secret creation.'
  },
  'AWS::CodeBuild::Project': {
    pattern: 'unknown',
    properties: [
      { name: 'EncryptionKey', type: 'string', required: false, purpose: 'kms-key-id' }
    ],
    defaultBehavior: 'Build artifacts encrypted with AWS managed S3 key by default.',
    notes: 'EncryptionKey applies to build output artifacts stored in S3.'
  }
};

for (const [resourceType, update] of Object.entries(updates)) {
  if (data[resourceType]) {
    data[resourceType] = update;
  }
}

const sorted = Object.keys(data).sort().reduce((acc, key) => {
  acc[key] = data[key];
  return acc;
}, {} as Record<string, any>);

fs.writeFileSync('sources/EncryptionAtRest/data.json', JSON.stringify(sorted, null, 2) + '\n');
console.log(`Updated ${Object.keys(updates).length} high-priority resources`);
