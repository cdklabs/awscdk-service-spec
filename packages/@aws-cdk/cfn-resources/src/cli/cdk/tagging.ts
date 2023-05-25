import { Resource, TagInformation, TagVariant } from '@aws-cdk/service-spec';

export type TaggabilityStyle =
  | { readonly style: 'legacy'; readonly tagPropertyName: string; readonly variant: TagVariant }
  | { readonly style: 'modern'; readonly tagPropertyName: string; readonly variant: TagVariant };

/**
 * Whether this resource is a legacy `ITaggable` resource
 */
export function resourceTaggabilityStyle(resource: Resource): TaggabilityStyle | undefined {
  const legacyTag = LEGACY_TAGGABLES[resource.cloudFormationType];
  if (legacyTag) {
    const [tagPropertyName, variant] = legacyTag;
    return { style: 'legacy', tagPropertyName, variant };
  }

  if (resource.tagInformation) {
    return { style: 'modern', ...resource.tagInformation };
  }

  return undefined;
}

const LEGACY_TAGGABLES: Record<string, [string, TagInformation['variant']]> = {
  'AWS::AccessAnalyzer::Analyzer': ['Tags', 'standard'],
  'AWS::ACMPCA::CertificateAuthority': ['Tags', 'standard'],
  'AWS::AmazonMQ::Broker': ['Tags', 'standard'],
  'AWS::AmazonMQ::Configuration': ['Tags', 'standard'],
  'AWS::Amplify::App': ['Tags', 'standard'],
  'AWS::Amplify::Branch': ['Tags', 'standard'],
  'AWS::AmplifyUIBuilder::Component': ['Tags', 'map'],
  'AWS::AmplifyUIBuilder::Form': ['Tags', 'map'],
  'AWS::AmplifyUIBuilder::Theme': ['Tags', 'map'],
  'AWS::ApiGateway::ApiKey': ['Tags', 'standard'],
  'AWS::ApiGateway::ClientCertificate': ['Tags', 'standard'],
  'AWS::ApiGateway::DomainName': ['Tags', 'standard'],
  'AWS::ApiGateway::RestApi': ['Tags', 'standard'],
  'AWS::ApiGateway::Stage': ['Tags', 'standard'],
  'AWS::ApiGateway::UsagePlan': ['Tags', 'standard'],
  'AWS::ApiGateway::VpcLink': ['Tags', 'standard'],
  'AWS::ApiGatewayV2::Api': ['Tags', 'map'],
  'AWS::ApiGatewayV2::DomainName': ['Tags', 'map'],
  'AWS::ApiGatewayV2::Stage': ['Tags', 'map'],
  'AWS::ApiGatewayV2::VpcLink': ['Tags', 'map'],
  'AWS::AppFlow::Flow': ['Tags', 'standard'],
  'AWS::AppIntegrations::DataIntegration': ['Tags', 'standard'],
  'AWS::AppIntegrations::EventIntegration': ['Tags', 'standard'],
  'AWS::ApplicationInsights::Application': ['Tags', 'standard'],
  'AWS::AppMesh::GatewayRoute': ['Tags', 'standard'],
  'AWS::AppMesh::Mesh': ['Tags', 'standard'],
  'AWS::AppMesh::Route': ['Tags', 'standard'],
  'AWS::AppMesh::VirtualGateway': ['Tags', 'standard'],
  'AWS::AppMesh::VirtualNode': ['Tags', 'standard'],
  'AWS::AppMesh::VirtualRouter': ['Tags', 'standard'],
  'AWS::AppMesh::VirtualService': ['Tags', 'standard'],
  'AWS::AppRunner::ObservabilityConfiguration': ['Tags', 'standard'],
  'AWS::AppRunner::Service': ['Tags', 'standard'],
  'AWS::AppRunner::VpcConnector': ['Tags', 'standard'],
  'AWS::AppRunner::VpcIngressConnection': ['Tags', 'standard'],
  'AWS::AppSync::GraphQLApi': ['Tags', 'standard'],
  'AWS::APS::RuleGroupsNamespace': ['Tags', 'standard'],
  'AWS::APS::Workspace': ['Tags', 'standard'],
  'AWS::AppStream::AppBlock': ['Tags', 'standard'],
  'AWS::AppStream::Application': ['Tags', 'standard'],
  'AWS::AppStream::Fleet': ['Tags', 'standard'],
  'AWS::AppStream::ImageBuilder': ['Tags', 'standard'],
  'AWS::AppStream::Stack': ['Tags', 'standard'],
  'AWS::Athena::DataCatalog': ['Tags', 'standard'],
  'AWS::Athena::WorkGroup': ['Tags', 'standard'],
  'AWS::AuditManager::Assessment': ['Tags', 'standard'],
  'AWS::AutoScaling::AutoScalingGroup': ['Tags', 'asg'],
  'AWS::Batch::ComputeEnvironment': ['Tags', 'map'],
  'AWS::Batch::JobDefinition': ['Tags', 'map'],
  'AWS::Batch::JobQueue': ['Tags', 'map'],
  'AWS::Batch::SchedulingPolicy': ['Tags', 'map'],
  'AWS::Cassandra::Keyspace': ['Tags', 'standard'],
  'AWS::Cassandra::Table': ['Tags', 'standard'],
  'AWS::BillingConductor::BillingGroup': ['Tags', 'standard'],
  'AWS::BillingConductor::CustomLineItem': ['Tags', 'standard'],
  'AWS::BillingConductor::PricingPlan': ['Tags', 'standard'],
  'AWS::BillingConductor::PricingRule': ['Tags', 'standard'],
  'AWS::CertificateManager::Certificate': ['Tags', 'standard'],
  'AWS::Cloud9::EnvironmentEC2': ['Tags', 'standard'],
  'AWS::CloudFormation::Stack': ['Tags', 'standard'],
  'AWS::CloudFormation::StackSet': ['Tags', 'standard'],
  'AWS::CloudFront::Distribution': ['Tags', 'standard'],
  'AWS::CloudFront::StreamingDistribution': ['Tags', 'standard'],
  'AWS::CloudWatch::InsightRule': ['Tags', 'standard'],
  'AWS::CloudWatch::MetricStream': ['Tags', 'standard'],
  'AWS::CodeArtifact::Domain': ['Tags', 'standard'],
  'AWS::CodeArtifact::Repository': ['Tags', 'standard'],
  'AWS::CloudTrail::Channel': ['Tags', 'standard'],
  'AWS::CloudTrail::EventDataStore': ['Tags', 'standard'],
  'AWS::CloudTrail::Trail': ['Tags', 'standard'],
  'AWS::CodeBuild::Project': ['Tags', 'standard'],
  'AWS::CodeBuild::ReportGroup': ['Tags', 'standard'],
  'AWS::CodeCommit::Repository': ['Tags', 'standard'],
  'AWS::CodeGuruProfiler::ProfilingGroup': ['Tags', 'standard'],
  'AWS::CodeDeploy::Application': ['Tags', 'standard'],
  'AWS::CodeDeploy::DeploymentGroup': ['Tags', 'standard'],
  'AWS::CodeGuruReviewer::RepositoryAssociation': ['Tags', 'standard'],
  'AWS::CodePipeline::CustomActionType': ['Tags', 'standard'],
  'AWS::CodePipeline::Pipeline': ['Tags', 'standard'],
  'AWS::CodeStarConnections::Connection': ['Tags', 'standard'],
  'AWS::CodeStarNotifications::NotificationRule': ['Tags', 'map'],
  'AWS::Cognito::UserPool': ['UserPoolTags', 'map'],
  'AWS::Comprehend::Flywheel': ['Tags', 'standard'],
  'AWS::Connect::ContactFlow': ['Tags', 'standard'],
  'AWS::Connect::ContactFlowModule': ['Tags', 'standard'],
  'AWS::Connect::HoursOfOperation': ['Tags', 'standard'],
  'AWS::Connect::PhoneNumber': ['Tags', 'standard'],
  'AWS::Connect::QuickConnect': ['Tags', 'standard'],
  'AWS::Connect::Rule': ['Tags', 'standard'],
  'AWS::Connect::TaskTemplate': ['Tags', 'standard'],
  'AWS::Connect::User': ['Tags', 'standard'],
  'AWS::Config::AggregationAuthorization': ['Tags', 'standard'],
  'AWS::Config::ConfigurationAggregator': ['Tags', 'standard'],
  'AWS::Config::StoredQuery': ['Tags', 'standard'],
  'AWS::ConnectCampaigns::Campaign': ['Tags', 'standard'],
  'AWS::CustomerProfiles::Domain': ['Tags', 'standard'],
  'AWS::CustomerProfiles::Integration': ['Tags', 'standard'],
  'AWS::CustomerProfiles::ObjectType': ['Tags', 'standard'],
  'AWS::DataBrew::Dataset': ['Tags', 'standard'],
  'AWS::DataBrew::Job': ['Tags', 'standard'],
  'AWS::DataBrew::Project': ['Tags', 'standard'],
  'AWS::DataBrew::Recipe': ['Tags', 'standard'],
  'AWS::DataBrew::Ruleset': ['Tags', 'standard'],
  'AWS::DataBrew::Schedule': ['Tags', 'standard'],
  'AWS::DataSync::Agent': ['Tags', 'standard'],
  'AWS::DataSync::LocationEFS': ['Tags', 'standard'],
  'AWS::DataSync::LocationFSxLustre': ['Tags', 'standard'],
  'AWS::DataSync::LocationFSxONTAP': ['Tags', 'standard'],
  'AWS::DataSync::LocationFSxOpenZFS': ['Tags', 'standard'],
  'AWS::DataSync::LocationFSxWindows': ['Tags', 'standard'],
  'AWS::DataSync::LocationHDFS': ['Tags', 'standard'],
  'AWS::DataSync::LocationNFS': ['Tags', 'standard'],
  'AWS::DataSync::LocationObjectStorage': ['Tags', 'standard'],
  'AWS::DataSync::LocationS3': ['Tags', 'standard'],
  'AWS::DataSync::LocationSMB': ['Tags', 'standard'],
  'AWS::DataSync::Task': ['Tags', 'standard'],
  'AWS::Detective::Graph': ['Tags', 'standard'],
  'AWS::DAX::Cluster': ['Tags', 'map'],
  'AWS::DeviceFarm::DevicePool': ['Tags', 'standard'],
  'AWS::DeviceFarm::InstanceProfile': ['Tags', 'standard'],
  'AWS::DeviceFarm::NetworkProfile': ['Tags', 'standard'],
  'AWS::DeviceFarm::Project': ['Tags', 'standard'],
  'AWS::DeviceFarm::TestGridProject': ['Tags', 'standard'],
  'AWS::DeviceFarm::VPCEConfiguration': ['Tags', 'standard'],
  'AWS::DLM::LifecyclePolicy': ['Tags', 'standard'],
  'AWS::DMS::Endpoint': ['Tags', 'standard'],
  'AWS::DMS::EventSubscription': ['Tags', 'standard'],
  'AWS::DMS::ReplicationInstance': ['Tags', 'standard'],
  'AWS::DMS::ReplicationSubnetGroup': ['Tags', 'standard'],
  'AWS::DMS::ReplicationTask': ['Tags', 'standard'],
  'AWS::DocDB::DBCluster': ['Tags', 'standard'],
  'AWS::DocDB::DBClusterParameterGroup': ['Tags', 'standard'],
  'AWS::DocDB::DBInstance': ['Tags', 'standard'],
  'AWS::DocDB::DBSubnetGroup': ['Tags', 'standard'],
  'AWS::DynamoDB::Table': ['Tags', 'standard'],
  'AWS::DocDBElastic::Cluster': ['Tags', 'standard'],
  'AWS::ECR::PublicRepository': ['Tags', 'standard'],
  'AWS::ECR::Repository': ['Tags', 'standard'],
  'AWS::EC2::CarrierGateway': ['Tags', 'standard'],
  'AWS::EC2::CustomerGateway': ['Tags', 'standard'],
  'AWS::EC2::DHCPOptions': ['Tags', 'standard'],
  'AWS::EC2::EIP': ['Tags', 'standard'],
  'AWS::EC2::FlowLog': ['Tags', 'standard'],
  'AWS::EC2::IPAM': ['Tags', 'standard'],
  'AWS::EC2::IPAMPool': ['Tags', 'standard'],
  'AWS::EC2::IPAMResourceDiscovery': ['Tags', 'standard'],
  'AWS::EC2::IPAMResourceDiscoveryAssociation': ['Tags', 'standard'],
  'AWS::EC2::IPAMScope': ['Tags', 'standard'],
  'AWS::EC2::Instance': ['Tags', 'standard'],
  'AWS::EC2::InternetGateway': ['Tags', 'standard'],
  'AWS::EC2::KeyPair': ['Tags', 'standard'],
  'AWS::EC2::LocalGatewayRouteTable': ['Tags', 'standard'],
  'AWS::EC2::LocalGatewayRouteTableVPCAssociation': ['Tags', 'standard'],
  'AWS::EC2::LocalGatewayRouteTableVirtualInterfaceGroupAssociation': ['Tags', 'standard'],
  'AWS::EC2::NatGateway': ['Tags', 'standard'],
  'AWS::EC2::NetworkAcl': ['Tags', 'standard'],
  'AWS::EC2::NetworkInsightsAccessScope': ['Tags', 'standard'],
  'AWS::EC2::NetworkInsightsAccessScopeAnalysis': ['Tags', 'standard'],
  'AWS::EC2::NetworkInsightsAnalysis': ['Tags', 'standard'],
  'AWS::EC2::NetworkInsightsPath': ['Tags', 'standard'],
  'AWS::EC2::NetworkInterface': ['Tags', 'standard'],
  'AWS::EC2::PlacementGroup': ['Tags', 'standard'],
  'AWS::EC2::PrefixList': ['Tags', 'standard'],
  'AWS::EC2::RouteTable': ['Tags', 'standard'],
  'AWS::EC2::SecurityGroup': ['Tags', 'standard'],
  'AWS::EC2::Subnet': ['Tags', 'standard'],
  'AWS::EC2::TrafficMirrorFilter': ['Tags', 'standard'],
  'AWS::EC2::TrafficMirrorSession': ['Tags', 'standard'],
  'AWS::EC2::TrafficMirrorTarget': ['Tags', 'standard'],
  'AWS::EC2::TransitGateway': ['Tags', 'standard'],
  'AWS::EC2::TransitGatewayAttachment': ['Tags', 'standard'],
  'AWS::EC2::TransitGatewayConnect': ['Tags', 'standard'],
  'AWS::EC2::TransitGatewayMulticastDomain': ['Tags', 'standard'],
  'AWS::EC2::TransitGatewayPeeringAttachment': ['Tags', 'standard'],
  'AWS::EC2::TransitGatewayRouteTable': ['Tags', 'standard'],
  'AWS::EC2::TransitGatewayVpcAttachment': ['Tags', 'standard'],
  'AWS::EC2::VPC': ['Tags', 'standard'],
  'AWS::EC2::VPCPeeringConnection': ['Tags', 'standard'],
  'AWS::EC2::VPNConnection': ['Tags', 'standard'],
  'AWS::EC2::VPNGateway': ['Tags', 'standard'],
  'AWS::EC2::Volume': ['Tags', 'standard'],
  'AWS::ECS::CapacityProvider': ['Tags', 'standard'],
  'AWS::ECS::Cluster': ['Tags', 'standard'],
  'AWS::ECS::Service': ['Tags', 'standard'],
  'AWS::ECS::TaskDefinition': ['Tags', 'standard'],
  'AWS::EFS::AccessPoint': ['AccessPointTags', 'standard'],
  'AWS::EFS::FileSystem': ['FileSystemTags', 'standard'],
  'AWS::EKS::Addon': ['Tags', 'standard'],
  'AWS::EKS::Cluster': ['Tags', 'standard'],
  'AWS::EKS::FargateProfile': ['Tags', 'standard'],
  'AWS::EKS::IdentityProviderConfig': ['Tags', 'standard'],
  'AWS::EKS::Nodegroup': ['Tags', 'map'],
  'AWS::ElastiCache::CacheCluster': ['Tags', 'standard'],
  'AWS::ElastiCache::ParameterGroup': ['Tags', 'standard'],
  'AWS::ElastiCache::ReplicationGroup': ['Tags', 'standard'],
  'AWS::ElastiCache::SecurityGroup': ['Tags', 'standard'],
  'AWS::ElastiCache::SubnetGroup': ['Tags', 'standard'],
  'AWS::ElastiCache::User': ['Tags', 'standard'],
  'AWS::ElastiCache::UserGroup': ['Tags', 'standard'],
  'AWS::ElasticBeanstalk::Environment': ['Tags', 'standard'],
  'AWS::ElasticLoadBalancing::LoadBalancer': ['Tags', 'standard'],
  'AWS::ElasticLoadBalancingV2::LoadBalancer': ['Tags', 'standard'],
  'AWS::ElasticLoadBalancingV2::TargetGroup': ['Tags', 'standard'],
  'AWS::Elasticsearch::Domain': ['Tags', 'standard'],
  'AWS::EMR::Cluster': ['Tags', 'standard'],
  'AWS::EMR::Studio': ['Tags', 'standard'],
  'AWS::EMRServerless::Application': ['Tags', 'standard'],
  'AWS::EventSchemas::Discoverer': ['Tags', 'standard'],
  'AWS::EventSchemas::Registry': ['Tags', 'standard'],
  'AWS::EventSchemas::Schema': ['Tags', 'standard'],
  'AWS::Evidently::Experiment': ['Tags', 'standard'],
  'AWS::Evidently::Feature': ['Tags', 'standard'],
  'AWS::Evidently::Launch': ['Tags', 'standard'],
  'AWS::Evidently::Project': ['Tags', 'standard'],
  'AWS::Evidently::Segment': ['Tags', 'standard'],
  'AWS::EMRContainers::VirtualCluster': ['Tags', 'standard'],
  'AWS::FIS::ExperimentTemplate': ['Tags', 'map'],
  'AWS::Forecast::DatasetGroup': ['Tags', 'standard'],
  'AWS::FraudDetector::Detector': ['Tags', 'standard'],
  'AWS::FraudDetector::EntityType': ['Tags', 'standard'],
  'AWS::FraudDetector::EventType': ['Tags', 'standard'],
  'AWS::FraudDetector::Label': ['Tags', 'standard'],
  'AWS::FraudDetector::Outcome': ['Tags', 'standard'],
  'AWS::FraudDetector::Variable': ['Tags', 'standard'],
  'AWS::FSx::DataRepositoryAssociation': ['Tags', 'standard'],
  'AWS::FSx::FileSystem': ['Tags', 'standard'],
  'AWS::FSx::Snapshot': ['Tags', 'standard'],
  'AWS::FSx::StorageVirtualMachine': ['Tags', 'standard'],
  'AWS::FSx::Volume': ['Tags', 'standard'],
  'AWS::GameLift::GameServerGroup': ['Tags', 'standard'],
  'AWS::GameLift::GameSessionQueue': ['Tags', 'standard'],
  'AWS::GameLift::Location': ['Tags', 'standard'],
  'AWS::GameLift::MatchmakingConfiguration': ['Tags', 'standard'],
  'AWS::GameLift::MatchmakingRuleSet': ['Tags', 'standard'],
  'AWS::GameLift::Script': ['Tags', 'standard'],
  'AWS::GlobalAccelerator::Accelerator': ['Tags', 'standard'],
  'AWS::Glue::Crawler': ['Tags', 'map'],
  'AWS::Glue::DevEndpoint': ['Tags', 'map'],
  'AWS::Glue::Job': ['Tags', 'map'],
  'AWS::Glue::MLTransform': ['Tags', 'map'],
  'AWS::Glue::Registry': ['Tags', 'standard'],
  'AWS::Glue::Schema': ['Tags', 'standard'],
  'AWS::Glue::Trigger': ['Tags', 'map'],
  'AWS::Glue::Workflow': ['Tags', 'map'],
  'AWS::Greengrass::ConnectorDefinition': ['Tags', 'map'],
  'AWS::Greengrass::CoreDefinition': ['Tags', 'map'],
  'AWS::Greengrass::DeviceDefinition': ['Tags', 'map'],
  'AWS::Greengrass::FunctionDefinition': ['Tags', 'map'],
  'AWS::Greengrass::Group': ['Tags', 'map'],
  'AWS::Greengrass::LoggerDefinition': ['Tags', 'map'],
  'AWS::Greengrass::ResourceDefinition': ['Tags', 'map'],
  'AWS::Greengrass::SubscriptionDefinition': ['Tags', 'map'],
  'AWS::FMS::ResourceSet': ['Tags', 'standard'],
  'AWS::GreengrassV2::ComponentVersion': ['Tags', 'map'],
  'AWS::GreengrassV2::Deployment': ['Tags', 'map'],
  'AWS::GroundStation::Config': ['Tags', 'standard'],
  'AWS::GroundStation::DataflowEndpointGroup': ['Tags', 'standard'],
  'AWS::GroundStation::MissionProfile': ['Tags', 'standard'],
  'AWS::HealthLake::FHIRDatastore': ['Tags', 'standard'],
  'AWS::IAM::OIDCProvider': ['Tags', 'standard'],
  'AWS::IAM::Role': ['Tags', 'standard'],
  'AWS::IAM::SAMLProvider': ['Tags', 'standard'],
  'AWS::IAM::ServerCertificate': ['Tags', 'standard'],
  'AWS::IAM::User': ['Tags', 'standard'],
  'AWS::IAM::VirtualMFADevice': ['Tags', 'standard'],
  'AWS::GuardDuty::Detector': ['Tags', 'standard'],
  'AWS::GuardDuty::Filter': ['Tags', 'standard'],
  'AWS::GuardDuty::IPSet': ['Tags', 'standard'],
  'AWS::GuardDuty::ThreatIntelSet': ['Tags', 'standard'],
  'AWS::ImageBuilder::Component': ['Tags', 'map'],
  'AWS::ImageBuilder::ContainerRecipe': ['Tags', 'map'],
  'AWS::ImageBuilder::DistributionConfiguration': ['Tags', 'map'],
  'AWS::ImageBuilder::Image': ['Tags', 'map'],
  'AWS::ImageBuilder::ImagePipeline': ['Tags', 'map'],
  'AWS::ImageBuilder::ImageRecipe': ['Tags', 'map'],
  'AWS::ImageBuilder::InfrastructureConfiguration': ['Tags', 'map'],
  'AWS::InternetMonitor::Monitor': ['Tags', 'standard'],
  'AWS::IoT::Authorizer': ['Tags', 'standard'],
  'AWS::IoT::CACertificate': ['Tags', 'standard'],
  'AWS::IoT::CustomMetric': ['Tags', 'standard'],
  'AWS::IoT::Dimension': ['Tags', 'standard'],
  'AWS::IoT::DomainConfiguration': ['Tags', 'standard'],
  'AWS::IoT::FleetMetric': ['Tags', 'standard'],
  'AWS::IoT::JobTemplate': ['Tags', 'standard'],
  'AWS::IoT::MitigationAction': ['Tags', 'standard'],
  'AWS::IoT::ProvisioningTemplate': ['Tags', 'standard'],
  'AWS::IoT::RoleAlias': ['Tags', 'standard'],
  'AWS::IoT::ScheduledAudit': ['Tags', 'standard'],
  'AWS::IoT::SecurityProfile': ['Tags', 'standard'],
  'AWS::IoT::TopicRule': ['Tags', 'standard'],
  'AWS::IoTCoreDeviceAdvisor::SuiteDefinition': ['Tags', 'standard'],
  'AWS::IoTAnalytics::Channel': ['Tags', 'standard'],
  'AWS::IoTAnalytics::Dataset': ['Tags', 'standard'],
  'AWS::IoTAnalytics::Datastore': ['Tags', 'standard'],
  'AWS::IoTAnalytics::Pipeline': ['Tags', 'standard'],
  'AWS::IoTEvents::AlarmModel': ['Tags', 'standard'],
  'AWS::IoTEvents::DetectorModel': ['Tags', 'standard'],
  'AWS::IoTEvents::Input': ['Tags', 'standard'],
  'AWS::IoTFleetHub::Application': ['Tags', 'standard'],
  'AWS::IoTFleetWise::Campaign': ['Tags', 'standard'],
  'AWS::IoTFleetWise::DecoderManifest': ['Tags', 'standard'],
  'AWS::IoTFleetWise::Fleet': ['Tags', 'standard'],
  'AWS::IoTFleetWise::ModelManifest': ['Tags', 'standard'],
  'AWS::IoTFleetWise::SignalCatalog': ['Tags', 'standard'],
  'AWS::IoTFleetWise::Vehicle': ['Tags', 'standard'],
  'AWS::IoTSiteWise::Asset': ['Tags', 'standard'],
  'AWS::IoTSiteWise::AssetModel': ['Tags', 'standard'],
  'AWS::IoTSiteWise::Dashboard': ['Tags', 'standard'],
  'AWS::IoTSiteWise::Gateway': ['Tags', 'standard'],
  'AWS::IoTSiteWise::Portal': ['Tags', 'standard'],
  'AWS::IoTSiteWise::Project': ['Tags', 'standard'],
  'AWS::IoTTwinMaker::ComponentType': ['Tags', 'map'],
  'AWS::IoTTwinMaker::Entity': ['Tags', 'map'],
  'AWS::IoTTwinMaker::Scene': ['Tags', 'map'],
  'AWS::IoTTwinMaker::SyncJob': ['Tags', 'map'],
  'AWS::IoTTwinMaker::Workspace': ['Tags', 'map'],
  'AWS::IVSChat::LoggingConfiguration': ['Tags', 'standard'],
  'AWS::IVSChat::Room': ['Tags', 'standard'],
  'AWS::IVS::Channel': ['Tags', 'standard'],
  'AWS::IVS::PlaybackKeyPair': ['Tags', 'standard'],
  'AWS::IVS::RecordingConfiguration': ['Tags', 'standard'],
  'AWS::IVS::StreamKey': ['Tags', 'standard'],
  'AWS::IoTWireless::Destination': ['Tags', 'standard'],
  'AWS::IoTWireless::DeviceProfile': ['Tags', 'standard'],
  'AWS::IoTWireless::FuotaTask': ['Tags', 'standard'],
  'AWS::IoTWireless::MulticastGroup': ['Tags', 'standard'],
  'AWS::IoTWireless::NetworkAnalyzerConfiguration': ['Tags', 'standard'],
  'AWS::IoTWireless::PartnerAccount': ['Tags', 'standard'],
  'AWS::IoTWireless::ServiceProfile': ['Tags', 'standard'],
  'AWS::IoTWireless::TaskDefinition': ['Tags', 'standard'],
  'AWS::IoTWireless::WirelessDevice': ['Tags', 'standard'],
  'AWS::IoTWireless::WirelessGateway': ['Tags', 'standard'],
  'AWS::Kendra::DataSource': ['Tags', 'standard'],
  'AWS::Kendra::Faq': ['Tags', 'standard'],
  'AWS::Kendra::Index': ['Tags', 'standard'],
  'AWS::KendraRanking::ExecutionPlan': ['Tags', 'standard'],
  'AWS::Kinesis::Stream': ['Tags', 'standard'],
  'AWS::KinesisAnalyticsV2::Application': ['Tags', 'standard'],
  'AWS::KinesisFirehose::DeliveryStream': ['Tags', 'standard'],
  'AWS::KinesisVideo::SignalingChannel': ['Tags', 'standard'],
  'AWS::KinesisVideo::Stream': ['Tags', 'standard'],
  'AWS::KMS::Key': ['Tags', 'standard'],
  'AWS::KMS::ReplicaKey': ['Tags', 'standard'],
  'AWS::Lambda::Function': ['Tags', 'standard'],
  'AWS::Lightsail::Bucket': ['Tags', 'standard'],
  'AWS::Lightsail::Certificate': ['Tags', 'standard'],
  'AWS::Lightsail::Container': ['Tags', 'standard'],
  'AWS::Lightsail::Database': ['Tags', 'standard'],
  'AWS::Lightsail::Disk': ['Tags', 'standard'],
  'AWS::Lightsail::Distribution': ['Tags', 'standard'],
  'AWS::Lightsail::Instance': ['Tags', 'standard'],
  'AWS::Lightsail::LoadBalancer': ['Tags', 'standard'],
  'AWS::Logs::LogGroup': ['Tags', 'standard'],
  'AWS::LookoutEquipment::InferenceScheduler': ['Tags', 'standard'],
  'AWS::Macie::AllowList': ['Tags', 'standard'],
  'AWS::ManagedBlockchain::Accessor': ['Tags', 'standard'],
  'AWS::M2::Application': ['Tags', 'map'],
  'AWS::M2::Environment': ['Tags', 'map'],
  'AWS::MediaConvert::JobTemplate': ['Tags', 'map'],
  'AWS::MediaConvert::Preset': ['Tags', 'map'],
  'AWS::MediaConvert::Queue': ['Tags', 'map'],
  'AWS::MediaLive::Channel': ['Tags', 'map'],
  'AWS::MediaLive::Input': ['Tags', 'map'],
  'AWS::MediaLive::InputSecurityGroup': ['Tags', 'map'],
  'AWS::MediaStore::Container': ['Tags', 'standard'],
  'AWS::MediaPackage::Asset': ['Tags', 'standard'],
  'AWS::MediaPackage::Channel': ['Tags', 'standard'],
  'AWS::MediaPackage::OriginEndpoint': ['Tags', 'standard'],
  'AWS::MediaPackage::PackagingConfiguration': ['Tags', 'standard'],
  'AWS::MediaPackage::PackagingGroup': ['Tags', 'standard'],
  'AWS::MediaTailor::PlaybackConfiguration': ['Tags', 'standard'],
  'AWS::MSK::Cluster': ['Tags', 'map'],
  'AWS::MSK::ServerlessCluster': ['Tags', 'map'],
  'AWS::MemoryDB::ACL': ['Tags', 'standard'],
  'AWS::MemoryDB::Cluster': ['Tags', 'standard'],
  'AWS::MemoryDB::ParameterGroup': ['Tags', 'standard'],
  'AWS::MemoryDB::SubnetGroup': ['Tags', 'standard'],
  'AWS::MemoryDB::User': ['Tags', 'standard'],
  'AWS::MWAA::Environment': ['Tags', 'map'],
  'AWS::Neptune::DBCluster': ['Tags', 'standard'],
  'AWS::Neptune::DBClusterParameterGroup': ['Tags', 'standard'],
  'AWS::Neptune::DBInstance': ['Tags', 'standard'],
  'AWS::Neptune::DBParameterGroup': ['Tags', 'standard'],
  'AWS::Neptune::DBSubnetGroup': ['Tags', 'standard'],
  'AWS::NetworkFirewall::Firewall': ['Tags', 'standard'],
  'AWS::NetworkFirewall::FirewallPolicy': ['Tags', 'standard'],
  'AWS::NetworkFirewall::RuleGroup': ['Tags', 'standard'],
  'AWS::NetworkManager::ConnectAttachment': ['Tags', 'standard'],
  'AWS::NetworkManager::ConnectPeer': ['Tags', 'standard'],
  'AWS::NetworkManager::CoreNetwork': ['Tags', 'standard'],
  'AWS::NetworkManager::Device': ['Tags', 'standard'],
  'AWS::NetworkManager::GlobalNetwork': ['Tags', 'standard'],
  'AWS::NetworkManager::Link': ['Tags', 'standard'],
  'AWS::NetworkManager::Site': ['Tags', 'standard'],
  'AWS::NetworkManager::SiteToSiteVpnAttachment': ['Tags', 'standard'],
  'AWS::NetworkManager::TransitGatewayPeering': ['Tags', 'standard'],
  'AWS::NetworkManager::TransitGatewayRouteTableAttachment': ['Tags', 'standard'],
  'AWS::NetworkManager::VpcAttachment': ['Tags', 'standard'],
  'AWS::NimbleStudio::LaunchProfile': ['Tags', 'map'],
  'AWS::NimbleStudio::StreamingImage': ['Tags', 'map'],
  'AWS::NimbleStudio::Studio': ['Tags', 'map'],
  'AWS::NimbleStudio::StudioComponent': ['Tags', 'map'],
  'AWS::Oam::Link': ['Tags', 'map'],
  'AWS::Oam::Sink': ['Tags', 'map'],
  'AWS::Omics::AnnotationStore': ['Tags', 'map'],
  'AWS::Omics::ReferenceStore': ['Tags', 'map'],
  'AWS::Omics::RunGroup': ['Tags', 'map'],
  'AWS::Omics::SequenceStore': ['Tags', 'map'],
  'AWS::Omics::VariantStore': ['Tags', 'map'],
  'AWS::Omics::Workflow': ['Tags', 'map'],
  'AWS::OpenSearchService::Domain': ['Tags', 'standard'],
  'AWS::OpenSearchServerless::Collection': ['Tags', 'standard'],
  'AWS::OpsWorks::Layer': ['Tags', 'standard'],
  'AWS::OpsWorks::Stack': ['Tags', 'standard'],
  'AWS::Organizations::Account': ['Tags', 'standard'],
  'AWS::Organizations::OrganizationalUnit': ['Tags', 'standard'],
  'AWS::Organizations::Policy': ['Tags', 'standard'],
  'AWS::Organizations::ResourcePolicy': ['Tags', 'standard'],
  'AWS::OpsWorksCM::Server': ['Tags', 'standard'],
  'AWS::Panorama::ApplicationInstance': ['Tags', 'standard'],
  'AWS::Panorama::Package': ['Tags', 'standard'],
  'AWS::Pinpoint::App': ['Tags', 'map'],
  'AWS::Pinpoint::Campaign': ['Tags', 'map'],
  'AWS::Pinpoint::EmailTemplate': ['Tags', 'map'],
  'AWS::Pinpoint::InAppTemplate': ['Tags', 'map'],
  'AWS::Pinpoint::PushTemplate': ['Tags', 'map'],
  'AWS::Pinpoint::Segment': ['Tags', 'map'],
  'AWS::Pinpoint::SmsTemplate': ['Tags', 'map'],
  'AWS::Pipes::Pipe': ['Tags', 'map'],
  'AWS::QLDB::Ledger': ['Tags', 'standard'],
  'AWS::QLDB::Stream': ['Tags', 'standard'],
  'AWS::RAM::ResourceShare': ['Tags', 'standard'],
  'AWS::QuickSight::Analysis': ['Tags', 'standard'],
  'AWS::QuickSight::Dashboard': ['Tags', 'standard'],
  'AWS::QuickSight::DataSet': ['Tags', 'standard'],
  'AWS::QuickSight::DataSource': ['Tags', 'standard'],
  'AWS::QuickSight::Template': ['Tags', 'standard'],
  'AWS::QuickSight::Theme': ['Tags', 'standard'],
  'AWS::RDS::DBCluster': ['Tags', 'standard'],
  'AWS::RDS::DBClusterParameterGroup': ['Tags', 'standard'],
  'AWS::RDS::DBInstance': ['Tags', 'standard'],
  'AWS::RDS::DBParameterGroup': ['Tags', 'standard'],
  'AWS::RDS::DBSecurityGroup': ['Tags', 'standard'],
  'AWS::RDS::DBSubnetGroup': ['Tags', 'standard'],
  'AWS::RDS::EventSubscription': ['Tags', 'standard'],
  'AWS::RDS::OptionGroup': ['Tags', 'standard'],
  'AWS::RedshiftServerless::Namespace': ['Tags', 'standard'],
  'AWS::RedshiftServerless::Workgroup': ['Tags', 'standard'],
  'AWS::Redshift::Cluster': ['Tags', 'standard'],
  'AWS::Redshift::ClusterParameterGroup': ['Tags', 'standard'],
  'AWS::Redshift::ClusterSecurityGroup': ['Tags', 'standard'],
  'AWS::Redshift::ClusterSubnetGroup': ['Tags', 'standard'],
  'AWS::Redshift::EventSubscription': ['Tags', 'standard'],
  'AWS::ResilienceHub::App': ['Tags', 'map'],
  'AWS::ResilienceHub::ResiliencyPolicy': ['Tags', 'map'],
  'AWS::RefactorSpaces::Application': ['Tags', 'standard'],
  'AWS::RefactorSpaces::Environment': ['Tags', 'standard'],
  'AWS::RefactorSpaces::Route': ['Tags', 'standard'],
  'AWS::RefactorSpaces::Service': ['Tags', 'standard'],
  'AWS::Rekognition::Collection': ['Tags', 'standard'],
  'AWS::Rekognition::StreamProcessor': ['Tags', 'standard'],
  'AWS::ResourceExplorer2::Index': ['Tags', 'map'],
  'AWS::ResourceExplorer2::View': ['Tags', 'map'],
  'AWS::ResourceGroups::Group': ['Tags', 'standard'],
  'AWS::RoboMaker::Fleet': ['Tags', 'map'],
  'AWS::RoboMaker::Robot': ['Tags', 'map'],
  'AWS::RoboMaker::RobotApplication': ['Tags', 'map'],
  'AWS::RoboMaker::SimulationApplication': ['Tags', 'map'],
  'AWS::Route53RecoveryControl::Cluster': ['Tags', 'standard'],
  'AWS::Route53RecoveryControl::ControlPanel': ['Tags', 'standard'],
  'AWS::Route53RecoveryControl::SafetyRule': ['Tags', 'standard'],
  'AWS::Route53::HostedZone': ['HostedZoneTags', 'standard'],
  'AWS::RolesAnywhere::CRL': ['Tags', 'standard'],
  'AWS::RolesAnywhere::Profile': ['Tags', 'standard'],
  'AWS::RolesAnywhere::TrustAnchor': ['Tags', 'standard'],
  'AWS::Route53Resolver::FirewallDomainList': ['Tags', 'standard'],
  'AWS::Route53Resolver::FirewallRuleGroup': ['Tags', 'standard'],
  'AWS::Route53Resolver::FirewallRuleGroupAssociation': ['Tags', 'standard'],
  'AWS::Route53Resolver::ResolverEndpoint': ['Tags', 'standard'],
  'AWS::Route53Resolver::ResolverRule': ['Tags', 'standard'],
  'AWS::Route53RecoveryReadiness::Cell': ['Tags', 'standard'],
  'AWS::Route53RecoveryReadiness::ReadinessCheck': ['Tags', 'standard'],
  'AWS::Route53RecoveryReadiness::RecoveryGroup': ['Tags', 'standard'],
  'AWS::Route53RecoveryReadiness::ResourceSet': ['Tags', 'standard'],
  'AWS::RUM::AppMonitor': ['Tags', 'standard'],
  'AWS::S3::Bucket': ['Tags', 'standard'],
  'AWS::S3::StorageLens': ['Tags', 'standard'],
  'AWS::Serverless::Api': ['Tags', 'map'],
  'AWS::Serverless::Application': ['Tags', 'map'],
  'AWS::Serverless::Function': ['Tags', 'map'],
  'AWS::Serverless::HttpApi': ['Tags', 'map'],
  'AWS::Serverless::SimpleTable': ['Tags', 'map'],
  'AWS::Serverless::StateMachine': ['Tags', 'map'],
  'AWS::S3Outposts::Bucket': ['Tags', 'standard'],
  'AWS::SageMaker::App': ['Tags', 'standard'],
  'AWS::SageMaker::AppImageConfig': ['Tags', 'standard'],
  'AWS::SageMaker::CodeRepository': ['Tags', 'standard'],
  'AWS::SageMaker::DataQualityJobDefinition': ['Tags', 'standard'],
  'AWS::SageMaker::Device': ['Tags', 'standard'],
  'AWS::SageMaker::DeviceFleet': ['Tags', 'standard'],
  'AWS::SageMaker::Domain': ['Tags', 'standard'],
  'AWS::SageMaker::Endpoint': ['Tags', 'standard'],
  'AWS::SageMaker::EndpointConfig': ['Tags', 'standard'],
  'AWS::SageMaker::FeatureGroup': ['Tags', 'standard'],
  'AWS::SageMaker::Image': ['Tags', 'standard'],
  'AWS::SageMaker::InferenceExperiment': ['Tags', 'standard'],
  'AWS::SageMaker::Model': ['Tags', 'standard'],
  'AWS::SageMaker::ModelBiasJobDefinition': ['Tags', 'standard'],
  'AWS::SageMaker::ModelCard': ['Tags', 'standard'],
  'AWS::SageMaker::ModelExplainabilityJobDefinition': ['Tags', 'standard'],
  'AWS::SageMaker::ModelPackage': ['Tags', 'standard'],
  'AWS::SageMaker::ModelPackageGroup': ['Tags', 'standard'],
  'AWS::SageMaker::ModelQualityJobDefinition': ['Tags', 'standard'],
  'AWS::SageMaker::MonitoringSchedule': ['Tags', 'standard'],
  'AWS::SageMaker::NotebookInstance': ['Tags', 'standard'],
  'AWS::SageMaker::Pipeline': ['Tags', 'standard'],
  'AWS::SageMaker::Project': ['Tags', 'standard'],
  'AWS::SageMaker::Space': ['Tags', 'standard'],
  'AWS::SageMaker::UserProfile': ['Tags', 'standard'],
  'AWS::SageMaker::Workteam': ['Tags', 'standard'],
  'AWS::Scheduler::ScheduleGroup': ['Tags', 'standard'],
  'AWS::SecretsManager::Secret': ['Tags', 'standard'],
  'AWS::ServiceCatalogAppRegistry::Application': ['Tags', 'map'],
  'AWS::ServiceCatalogAppRegistry::AttributeGroup': ['Tags', 'map'],
  'AWS::SecurityHub::Hub': ['Tags', 'map'],
  'AWS::ServiceCatalog::CloudFormationProduct': ['Tags', 'standard'],
  'AWS::ServiceCatalog::CloudFormationProvisionedProduct': ['Tags', 'standard'],
  'AWS::ServiceCatalog::Portfolio': ['Tags', 'standard'],
  'AWS::SES::ContactList': ['Tags', 'standard'],
  'AWS::ServiceDiscovery::HttpNamespace': ['Tags', 'standard'],
  'AWS::ServiceDiscovery::PrivateDnsNamespace': ['Tags', 'standard'],
  'AWS::ServiceDiscovery::PublicDnsNamespace': ['Tags', 'standard'],
  'AWS::ServiceDiscovery::Service': ['Tags', 'standard'],
  'AWS::Signer::SigningProfile': ['Tags', 'standard'],
  'AWS::SNS::Topic': ['Tags', 'standard'],
  'AWS::SQS::Queue': ['Tags', 'standard'],
  'AWS::SSM::Document': ['Tags', 'standard'],
  'AWS::SSM::MaintenanceWindow': ['Tags', 'standard'],
  'AWS::SSM::Parameter': ['Tags', 'map'],
  'AWS::SSM::PatchBaseline': ['Tags', 'standard'],
  'AWS::SSMIncidents::ReplicationSet': ['Tags', 'standard'],
  'AWS::SSMIncidents::ResponsePlan': ['Tags', 'standard'],
  'AWS::SSO::PermissionSet': ['Tags', 'standard'],
  'AWS::Synthetics::Canary': ['Tags', 'standard'],
  'AWS::Synthetics::Group': ['Tags', 'standard'],
  'AWS::SystemsManagerSAP::Application': ['Tags', 'standard'],
  'AWS::Timestream::Database': ['Tags', 'standard'],
  'AWS::Timestream::ScheduledQuery': ['Tags', 'standard'],
  'AWS::Timestream::Table': ['Tags', 'standard'],
  'AWS::VpcLattice::AccessLogSubscription': ['Tags', 'standard'],
  'AWS::VpcLattice::Listener': ['Tags', 'standard'],
  'AWS::VpcLattice::Rule': ['Tags', 'standard'],
  'AWS::VpcLattice::Service': ['Tags', 'standard'],
  'AWS::VpcLattice::ServiceNetwork': ['Tags', 'standard'],
  'AWS::VpcLattice::ServiceNetworkServiceAssociation': ['Tags', 'standard'],
  'AWS::VpcLattice::ServiceNetworkVpcAssociation': ['Tags', 'standard'],
  'AWS::VpcLattice::TargetGroup': ['Tags', 'standard'],
  'AWS::VoiceID::Domain': ['Tags', 'standard'],
  'AWS::Transfer::Agreement': ['Tags', 'standard'],
  'AWS::Transfer::Certificate': ['Tags', 'standard'],
  'AWS::Transfer::Connector': ['Tags', 'standard'],
  'AWS::Transfer::Profile': ['Tags', 'standard'],
  'AWS::Transfer::Server': ['Tags', 'standard'],
  'AWS::Transfer::User': ['Tags', 'standard'],
  'AWS::Transfer::Workflow': ['Tags', 'standard'],
  'AWS::Wisdom::Assistant': ['Tags', 'standard'],
  'AWS::Wisdom::AssistantAssociation': ['Tags', 'standard'],
  'AWS::Wisdom::KnowledgeBase': ['Tags', 'standard'],
  'AWS::WAFv2::IPSet': ['Tags', 'standard'],
  'AWS::WAFv2::RegexPatternSet': ['Tags', 'standard'],
  'AWS::WAFv2::RuleGroup': ['Tags', 'standard'],
  'AWS::WAFv2::WebACL': ['Tags', 'standard'],
  'AWS::WorkSpaces::ConnectionAlias': ['Tags', 'standard'],
  'AWS::WorkSpaces::Workspace': ['Tags', 'standard'],
  'AWS::StepFunctions::Activity': ['Tags', 'standard'],
  'AWS::StepFunctions::StateMachine': ['Tags', 'standard'],
};
