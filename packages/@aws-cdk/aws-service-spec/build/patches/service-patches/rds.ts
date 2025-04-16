import { fp, registerServicePatches } from './core';
import { patching, types } from '@aws-cdk/service-spec-importers';

registerServicePatches(
  fp.addReadOnlyProperties(
    'AWS::RDS::DBCluster',
    ['ReadEndpoint'],
    patching.Reason.sourceIssue('ReadEndpoint should be listed in readOnlyProperties.'),
  ),
  fp.patchResourceAt<types.CloudFormationRegistryResource['readOnlyProperties']>(
    'AWS::DMS::ReplicationConfig',
    '/properties/CertificateDetails',
    patching.Reason.sourceIssue('Missing description caused property to be removed in L1 update.'),
    (descriptionAndType = {}) => {
      descriptionAndType = {
        "$ref" : "#/definitions/CertificateDetails",
        "description" : "The details of the DB instance’s server certificate."
      }
      return descriptionAndType;
    },
  ),
);
