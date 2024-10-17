import { fp, registerServicePatches, replaceResourceProperty, forResource } from './core';
import { patching, types } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  fp.patchResourceAt<types.CloudFormationRegistryResource['readOnlyProperties']>(
    'AWS::DMS::ReplicationConfig',
    '/readOnlyProperties',
    patching.Reason.sourceIssue('Incorrect case. Got upper case `/Properties` instead of `/properties'),
    (readOnlyProperties = []) => {
      for (const [idx, prop] of readOnlyProperties.entries()) {
        if (prop.startsWith('/Properties')) {
          readOnlyProperties[idx] = prop.replace('/Properties', '/properties');
        }
      }
      return readOnlyProperties;
    },
  ),

  forResource('AWS::DMS::DataProvider', (lens) => {
    replaceResourceProperty(
      'Settings',
      {
        type: 'object',
        description: 'The property identifies the exact type of settings for the data provider.',
        properties: {
          PostgreSqlSettings: {
            description: 'PostgreSqlSettings property identifier.',
            type: 'object',
            properties: {
              ServerName: {
                type: 'string',
              },
              Port: {
                type: 'integer',
              },
              DatabaseName: {
                type: 'string',
              },
              SslMode: {
                type: 'object',
                $ref: '#/definitions/DmsSslModeValue',
              },
              CertificateArn: {
                type: 'string',
              },
            },
            required: ['ServerName', 'Port', 'SslMode', 'DatabaseName'],
            additionalProperties: false,
          },
          MySqlSettings: {
            description: 'MySqlSettings property identifier.',
            type: 'object',
            properties: {
              ServerName: {
                type: 'string',
              },
              Port: {
                type: 'integer',
              },
              SslMode: {
                type: 'object',
                $ref: '#/definitions/DmsSslModeValue',
              },
              CertificateArn: {
                type: 'string',
              },
            },
            required: ['ServerName', 'Port', 'SslMode'],
            additionalProperties: false,
          },
          OracleSettings: {
            description: 'OracleSettings property identifier.',
            type: 'object',
            properties: {
              ServerName: {
                type: 'string',
              },
              Port: {
                type: 'integer',
              },
              DatabaseName: {
                type: 'string',
              },
              SslMode: {
                type: 'object',
                $ref: '#/definitions/DmsSslModeValue',
              },
              CertificateArn: {
                type: 'string',
              },
              AsmServer: {
                type: 'string',
              },
              SecretsManagerOracleAsmSecretId: {
                type: 'string',
              },
              SecretsManagerOracleAsmAccessRoleArn: {
                type: 'string',
              },
              SecretsManagerSecurityDbEncryptionSecretId: {
                type: 'string',
              },
              SecretsManagerSecurityDbEncryptionAccessRoleArn: {
                type: 'string',
              },
            },
            required: ['ServerName', 'Port', 'SslMode', 'DatabaseName'],
            additionalProperties: false,
          },
          MicrosoftSqlServerSettings: {
            description: 'MicrosoftSqlServerSettings property identifier.',
            type: 'object',
            properties: {
              ServerName: {
                type: 'string',
              },
              Port: {
                type: 'integer',
              },
              DatabaseName: {
                type: 'string',
              },
              SslMode: {
                type: 'object',
                $ref: '#/definitions/DmsSslModeValue',
              },
              CertificateArn: {
                type: 'string',
              },
            },
            required: ['ServerName', 'Port', 'SslMode', 'DatabaseName'],
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      patching.Reason.other(
        'Temporary fix to fix the issue of missing the Settings property till we fix the anyOff issue',
      ),
    )(lens);
  }),
);
