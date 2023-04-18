/**
 * These are patches for some service fields that used to be untyped once upon a
 * type (type=Json) but got types added later.
 *
 * Unfortunately, we already emitted them as untyped, so we have to keep on doing that.
 *
 * FIXME: This is how we're doing it for now. In the future, we will add special consideration
 * for these types of progressively typed properties.
 */

import { Reason, forResource, registerServicePatch, replaceDefinitionProperty, replaceResourceProperty } from './core';

const LEGACY_UNTYPED_PROPERTIES = {
  'AWS::ImageBuilder::DistributionConfiguration.Distribution': [
    'AmiDistributionConfiguration',
    'ContainerDistributionConfiguration',
  ],
  'AWS::Backup::ReportPlan': ['ReportDeliveryChannel', 'ReportSetting'],
  'AWS::CloudFormation::StackSet': ['ManagedExecution'],
  'AWS::CodeGuruProfiler::ProfilingGroup': ['AgentPermissions'],
  'AWS::Config::ConformancePack': ['TemplateSSMDocumentDetails'],
  'AWS::Connect::TaskTemplate': ['Constraints'],
  'AWS::EC2::FlowLog': ['DestinationOptions'],
  'AWS::EC2::Subnet': ['PrivateDnsNameOptionsOnLaunch'],
  'AWS::EC2::TransitGatewayAttachment': ['Options'],
  'AWS::EC2::TransitGatewayMulticastDomain': ['Options'],
  'AWS::EC2::TransitGatewayVpcAttachment': ['Options'],
  'AWS::ECR::PublicRepository': ['RepositoryCatalogData'],
  'AWS::ElastiCache::User': ['AuthenticationMode'],
  'AWS::Forecast::Dataset': ['EncryptionConfig', 'Schema'],
  'AWS::IoT::JobTemplate': ['AbortConfig', 'JobExecutionsRolloutConfig', 'PresignedUrlConfig', 'TimeoutConfig'],
  'AWS::IoTCoreDeviceAdvisor::SuiteDefinition': ['SuiteDefinitionConfiguration'],
  'AWS::IoTSiteWise::Portal': ['Alarms'],
  'AWS::IoTWireless::NetworkAnalyzerConfiguration': ['TraceContent'],
  'AWS::Lex::Bot': ['DataPrivacy'],
  'AWS::Lex::BotAlias': ['SentimentAnalysisSettings'],
  'AWS::LookoutEquipment::InferenceScheduler': ['DataInputConfiguration', 'DataOutputConfiguration'],
  'AWS::MemoryDB::User': ['AuthenticationMode'],
  'AWS::Route53::HealthCheck': ['HealthCheckConfig'],
  'AWS::S3::AccessPoint': ['PolicyStatus'],
  'AWS::SageMaker::FeatureGroup': ['OfflineStoreConfig', 'OnlineStoreConfig'],
  'AWS::SageMaker::Pipeline': ['ParallelismConfiguration', 'PipelineDefinition'],
  'AWS::SageMaker::Project': ['ServiceCatalogProvisioningDetails'],
  'AWS::Transfer::Connector': ['As2Config'],
  'AWS::WAFv2::LoggingConfiguration': ['LoggingFilter'],
  'AWS::Backup::BackupSelection.BackupSelectionResourceType': ['Conditions'],
  'AWS::Backup::Framework.FrameworkControl': ['ControlScope'],
  'AWS::DataBrew::Recipe.RecipeParameters': ['Input'],
  'AWS::FIS::ExperimentTemplate.ExperimentTemplateLogConfiguration': ['CloudWatchLogsConfiguration', 'S3Configuration'],
  'AWS::IoTTwinMaker::ComponentType.DataValue': ['RelationshipValue'],
  'AWS::IoTTwinMaker::Entity.DataValue': ['RelationshipValue'],
  'AWS::IoTTwinMaker::Entity.Property': ['Definition'],
  'AWS::IoTTwinMaker::Entity.Status': ['Error'],
  'AWS::Lex::Bot.TestBotAliasSettings': ['SentimentAnalysisSettings'],
  'AWS::Personalize::Dataset.DatasetImportJob': ['DataSource'],
  'AWS::Personalize::Solution.SolutionConfig': ['AutoMLConfig', 'HpoConfig'],
  'AWS::S3ObjectLambda::AccessPoint.TransformationConfiguration': ['ContentTransformation'],
  'AWS::S3Outposts::Bucket.Rule': ['Filter'],
  'AWS::SageMaker::ModelPackage.ModelPackageContainerDefinition': ['ModelInput'],
  'AWS::Transfer::Workflow.WorkflowStep': [
    'CopyStepDetails',
    'CustomStepDetails',
    'DeleteStepDetails',
    'TagStepDetails',
  ],
  'AWS::WAFv2::LoggingConfiguration.FieldToMatch': ['JsonBody', 'SingleHeader'],
  'AWS::WAFv2::RuleGroup.FieldToMatch': ['SingleQueryArgument', 'SingleHeader'],
  'AWS::WAFv2::RuleGroup.RuleAction': ['Allow', 'Block', 'Captcha', 'Challenge', 'Count'],
  'AWS::WAFv2::WebACL.FieldToMatch': ['SingleQueryArgument', 'SingleHeader'],
};

for (const [key, propertyNames] of Object.entries(LEGACY_UNTYPED_PROPERTIES)) {
  const parts = key.split('.');
  registerServicePatch(
    forResource(parts[0], (lens) => {
      for (const propertyName of propertyNames) {
        if (parts.length === 2) {
          replaceDefinitionProperty(parts[1], propertyName, { type: 'object' }, Reason.backwardsCompat())(lens);
        } else {
          replaceResourceProperty(propertyName, { type: 'object' }, Reason.backwardsCompat())(lens);
        }
      }
    }),
  );
}
