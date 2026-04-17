import { Entity, Relationship } from '@cdklabs/tskb';
import { Resource, Service } from './resource';

/**
 * A Metric Dimension (not an entity)
 */
export interface Dimension {
  /**
   * Name of the dimension
   */
  readonly name: string;
  /**
   * A potential value for this dimension
   */
  readonly value?: string;
}

/**
 * A set of Metric Dimension
 */
export interface DimensionSet extends Entity {
  /**
   * A unique value used to deduplicate the entity
   */
  dedupKey: string;
  /**
   * Human-readable name for this dimension set
   */
  name: string;
  /**
   * The dimensions in this set
   */
  dimensions: Dimension[];
}
export type ResourceHasDimensionSet = Relationship<Resource, DimensionSet>;
export type ServiceHasDimensionSet = Relationship<Service, DimensionSet>;

/**
 * A CloudWatch Metric
 */
export interface Metric extends Entity {
  /**
   * Metric namespace
   */
  readonly namespace: string;
  /**
   * Name of the metric
   */
  readonly name: string;
  /**
   * Default (suggested) statistic for this metric
   */
  readonly statistic: string;
  /**
   * An ordered list of the of the default statistics for this metric
   */
  readonly previousStatistics: string[];
  /**
   * A unique value used to deduplicate the entity
   */
  readonly dedupKey: string;
  /**
   * Description of the metric
   */
  readonly description?: string;
}
export type UsesDimensionSet = Relationship<Metric, DimensionSet>;
export type ResourceHasMetric = Relationship<Resource, Metric>;
export type ServiceHasMetric = Relationship<Service, Metric>;
