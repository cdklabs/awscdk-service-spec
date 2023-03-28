import { Entity, Relationship } from '@cdklabs/tskb';
import { Resource } from './resource';

/**
 * Augmentations for a CloudFormation resource type
 *
 * Augmentations are a deprecated mechanism for automatically generating metrics
 * functions for certain resources, utilizing TypeScript mixins.
 */
export interface ResourceAugmentation extends Entity {
  /**
   * Metric augmentations for this resource type
   */
  metrics?: ResourceMetricAugmentations;

  /**
   * The name of the file containing the class to be "augmented".
   *
   * @default kebab cased CloudFormation resource name + '-base'
   */
  baseClassFile?: string;

  /**
   * The name of the class to be "augmented".
   *
   * @default CloudFormation resource name + 'Base'
   */
  baseClass?: string;

  /**
   * The name of the file containing the interface to be "augmented".
   *
   * @default - same as ``classFile``.
   */
  interfaceFile?: string;

  /**
   * The name of the interface to be "augmented".
   *
   * @default 'I' + CloudFormation resource name
   */
  interface?: string;
}

export type IsAugmentedResource = Relationship<Resource, ResourceAugmentation>;

export interface ResourceMetricAugmentations {
  /**
   * The namespace of metrics for this service
   */
  namespace: string;

  /**
   * The properties of the resource class that provide values for the dimensions
   *
   * For example, `{ QueueName: 'queueName' }` says that the metric has a `QueueName`
   * dimension, for which the value can be obtained by reading `this.queueName`.
   */
  dimensions: { [key: string]: string };

  /**
   * The metrics for this resource
   */
  metrics: ResourceMetric[];
}

export interface ResourceMetric {
  /**
   * Uppercase-first metric name
   */
  name: string;

  /**
   * Documentation line
   */
  documentation: string;

  /**
   * Whether this is an even count (1 gets emitted every time something occurs)
   *
   * @default MetricType.Attrib
   */
  type?: MetricType;
}

export type MetricType =
  /**
   * This metric is emitted for events, measuring a attribute of the event.
   *
   * Typical examples of this would be duration, or request size, or similar.
   *
   * The default aggregate for this type of event is "Avg".
   */
  | 'attrib'

  /**
   * This metric is emitted for events, and the value is always `1`.
   *
   * Only "Sum" is a meaningful aggregate of this type of metric; all other
   * aggregations will only ever produce the value `1`.
   */
  | 'count'

  /**
   * This metric is emitted periodically, representing a system property.
   *
   * The metric measures some global ever-changing property, and does not
   * measure events. The most useful aggregate of this type of metric is "Max".
   */
  | 'gauge';
