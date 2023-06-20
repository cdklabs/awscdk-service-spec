import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { ResourceMetric, ResourceMetricAugmentations } from '@aws-cdk/service-spec-types';

export class Augmentations {
  constructor(private readonly db: SpecDatabase) {}

  public import() {
    this.insertQueue();
    this.insertTopic();
    this.insertRdsInstance();
    this.insertRdsCluster();
    this.insertFunction();
    this.insertVpn();
  }

  private insertQueue() {
    this.addMetrics('AWS::SQS::Queue', {
      namespace: 'AWS/SQS',
      dimensions: { QueueName: 'queueName' },
      metrics: [
        gauge('ApproximateAgeOfOldestMessage', 'The approximate age of the oldest non-deleted message in the queue.'),
        gauge(
          'ApproximateNumberOfMessagesDelayed',
          'The number of messages in the queue that are delayed and not available for reading immediately.',
        ),
        gauge('ApproximateNumberOfMessagesNotVisible', 'The number of messages that are in flight.'),
        gauge('ApproximateNumberOfMessagesVisible', 'The number of messages available for retrieval from the queue.'),
        count('NumberOfEmptyReceives', 'The number of ReceiveMessage API calls that did not return a message.'),
        count('NumberOfMessagesDeleted', 'The number of messages deleted from the queue.'),
        count('NumberOfMessagesReceived', 'The number of messages returned by calls to the ReceiveMessage action.'),
        count('NumberOfMessagesSent', 'The number of messages added to a queue.'),
        eventAtt('SentMessageSize', 'The size of messages added to a queue.'),
      ],
    });
  }

  private insertTopic() {
    this.addMetrics('AWS::SNS::Topic', {
      namespace: 'AWS/SNS',
      dimensions: { TopicName: 'topicName' },
      metrics: [
        eventAtt('PublishSize', 'Metric for the size of messages published through this topic'),
        count('NumberOfMessagesPublished', 'The number of messages published to your Amazon SNS topics.'),
        count(
          'NumberOfNotificationsDelivered',
          'The number of messages successfully delivered from your Amazon SNS topics to subscribing endpoints.',
        ),
        count('NumberOfNotificationsFailed', 'The number of messages that Amazon SNS failed to deliver.'),
        count(
          'NumberOfNotificationsFilteredOut',
          'The number of messages that were rejected by subscription filter policies.',
        ),
        count(
          'NumberOfNotificationsFilteredOut-NoMessageAttributes',
          'The number of messages that were rejected by subscription filter policies because the messages have no attributes.',
        ),
        count(
          'NumberOfNotificationsFilteredOut-InvalidAttributes',
          "The number of messages that were rejected by subscription filter policies because the messages' attributes are invalid",
        ),
        gauge(
          'SMSMonthToDateSpentUSD',
          'The charges you have accrued since the start of the current calendar month for sending SMS messages.',
        ),
        count('SMSSuccessRate', 'The rate of successful SMS message deliveries.'),
      ],
    });
  }

  private insertRdsInstance() {
    const inst = this.addMetrics('AWS::RDS::DBInstance', {
      namespace: 'AWS/RDS',
      dimensions: { DBInstanceIdentifier: 'instanceIdentifier' },
      // I'm pretty sure these metrics classifications are wrong -- they should have
      // been gauges, but they are not. We can't change them without changing users'
      // alarms.
      metrics: [
        eventAtt('CPUUtilization', 'The percentage of CPU utilization.'),
        eventAtt('DatabaseConnections', 'The number of database connections in use.'),
        eventAtt('FreeStorageSpace', 'The amount of available storage space.'),
        eventAtt('FreeableMemory', 'The amount of available random access memory.'),
        eventAtt('WriteIOPS', 'The average number of disk read I/O operations per second.'),
        eventAtt('ReadIOPS', 'The average number of disk write I/O operations per second.'),
      ],
    });

    inst.baseClassFile = 'instance';
    inst.baseClass = 'DatabaseInstanceBase';
    inst.interface = 'IDatabaseInstance';
  }

  private insertRdsCluster() {
    const clst = this.addMetrics('AWS::RDS::DBCluster', {
      namespace: 'AWS/RDS',
      dimensions: { DBClusterIdentifier: 'clusterIdentifier' },
      metrics: [
        eventAtt('CPUUtilization', 'The percentage of CPU utilization.'),
        eventAtt('DatabaseConnections', 'The number of database connections in use.'),
        eventAtt('Deadlocks', 'The average number of deadlocks in the database per second.'),
        eventAtt('EngineUptime', 'The amount of time that the instance has been running, in seconds.'),
        eventAtt('FreeableMemory', 'The amount of available random access memory, in bytes.'),
        eventAtt('FreeLocalStorage', 'The amount of local storage available, in bytes.'),
        eventAtt(
          'NetworkReceiveThroughput',
          'The amount of network throughput received from clients by each instance, in bytes per second.',
        ),
        eventAtt(
          'NetworkThroughput',
          'The amount of network throughput both received from and transmitted to clients by each instance, in bytes per second.',
        ),
        eventAtt(
          'NetworkTransmitThroughput',
          'The amount of network throughput sent to clients by each instance, in bytes per second.',
        ),
        eventAtt(
          'SnapshotStorageUsed',
          'The total amount of backup storage in bytes consumed by all Aurora snapshots outside its backup retention window.',
        ),
        eventAtt('TotalBackupStorageBilled', 'The total amount of backup storage in bytes for which you are billed.'),
        eventAtt('VolumeBytesUsed', 'The amount of storage used by your Aurora DB instance, in bytes.'),
        eventAtt(
          'VolumeReadIOPs',
          'The number of billed read I/O operations from a cluster volume, reported at 5-minute intervals.',
        ),
        eventAtt(
          'VolumeWriteIOPs',
          'The number of write disk I/O operations to the cluster volume, reported at 5-minute intervals.',
        ),
      ],
    });

    clst.baseClassFile = 'cluster';
    clst.baseClass = 'DatabaseClusterBase';
    clst.interfaceFile = 'cluster-ref';
    clst.interface = 'IDatabaseCluster';
  }

  private insertFunction() {
    this.addMetrics('AWS::Lambda::Function', {
      namespace: 'AWS/Lambda',
      dimensions: { FunctionName: 'functionName' },
      metrics: [
        count('Throttles', 'How often this Lambda is throttled'),
        count('Invocations', 'How often this Lambda is invoked'),
        count('Errors', 'How many invocations of this Lambda fail'),
        eventAtt('Duration', 'How long execution of this Lambda takes'),
      ],
    });
  }

  private insertVpn() {
    const con = this.addMetrics('AWS::EC2::VPNConnection', {
      namespace: 'AWS/VPN',
      dimensions: { VpnId: 'vpnId' },
      metrics: [
        eventAtt('TunnelState', 'The state of the tunnel. 0 indicates DOWN and 1 indicates UP.'),
        count('TunnelDataIn', 'The bytes received through the VPN tunnel.'),
        count('TunnelDataOut', 'The bytes sent through the VPN tunnel.'),
      ],
    });

    con.baseClassFile = 'vpn';
    con.baseClass = 'VpnConnectionBase';
    con.interface = 'IVpnConnection';
  }

  private addMetrics(resourceType: string, metrics: ResourceMetricAugmentations) {
    const resource = this.db.lookup('resource', 'cloudFormationType', 'equals', resourceType).only();

    const aug = this.db.allocate('augmentations', { metrics });
    this.db.link('isAugmented', resource, aug);

    return aug;
  }
}

function gauge(name: string, documentation: string): ResourceMetric {
  return { name, documentation, type: 'gauge' };
}

function count(name: string, documentation: string): ResourceMetric {
  return { name, documentation, type: 'count' };
}

function eventAtt(name: string, documentation: string): ResourceMetric {
  return { name, documentation };
}
