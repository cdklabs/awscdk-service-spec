/**
 * These are historic types for some service fields that used to be untyped once upon a
 * type (type=Json) but got types added later.
 *
 * Unfortunately, we already emitted them as untyped, so we have to keep on doing that.
 */

import { TypeHistoryMaker } from '../type-history';

const LEGACY_UNTYPED_PROPERTIES = {
  'AWS::Backup::ReportPlan': ['ReportDeliveryChannel', 'ReportSetting'],
  'AWS::CloudFormation::StackSet': ['ManagedExecution'],
  'AWS::CodeGuruProfiler::ProfilingGroup': ['AgentPermissions'],
  'AWS::Config::ConformancePack': ['TemplateSSMDocumentDetails'],
  'AWS::Config::RemediationConfiguration': ['Parameters'],
  'AWS::Connect::TaskTemplate': ['Constraints'],
  'AWS::EC2::FlowLog': ['DestinationOptions'],
  'AWS::EC2::Subnet': ['PrivateDnsNameOptionsOnLaunch'],
  'AWS::EC2::TransitGatewayAttachment': ['Options'],
  'AWS::EC2::TransitGatewayMulticastDomain': ['Options'],
  'AWS::EC2::TransitGatewayVpcAttachment': ['Options'],
  'AWS::ECR::PublicRepository': ['RepositoryCatalogData'],
  'AWS::ElastiCache::User': ['AuthenticationMode'],
  'AWS::Forecast::Dataset': ['EncryptionConfig', 'Schema'],
  'AWS::ImageBuilder::DistributionConfiguration.Distribution': [
    'AmiDistributionConfiguration',
    'ContainerDistributionConfiguration',
  ],
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
  'AWS::Timestream::Table': ['MagneticStoreWriteProperties', 'RetentionProperties'],
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
  'AWS::XRay::Group': ['Tags'],
  'AWS::XRay::SamplingRule': ['Tags'],
};

const historyMakers = new Map<string, TypeHistoryMaker>();
for (const [key, propertyNames] of Object.entries(LEGACY_UNTYPED_PROPERTIES)) {
  for (const propertyName of propertyNames) {
    // JSON types are always the oldest type in the history
    historyMakers.set(`${key}.${propertyName}`, (_key, history) => [{ type: 'json' }, ...history]);
  }
}

const legacyUntyped: TypeHistoryMaker = (key, history) => historyMakers.get(key)?.(key, history) ?? history;

export default legacyUntyped;
