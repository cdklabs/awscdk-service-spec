/**
 * CloudWatchConsoleServiceDirectory
 *
 * This source of AWS metrics is kindly provided to us
 * by the CloudWatch Explorer team (and used in their console).
 *
 * !! While this file contains types for the full source spec,
 * !! only `metricTemplates` data is currently used.
 */

export type CloudWatchConsoleServiceDirectory = ServiceDirectoryEntry[];

export interface ServiceDirectoryEntry {
  readonly id: string;
  readonly dashboard?: string;
  readonly crossServiceDashboard?: string;
  readonly resourceTypes?: ResourceType[];
  readonly controls?: Record<string, Control>;
  readonly metricTemplates?: MetricTemplate[];
  readonly dashboards?: Dashboard[];
}

/**
 * A single metric template for a resource
 */
export interface MetricTemplate {
  readonly id?: string;
  /**
   * CloudFormation resource name
   */
  readonly resourceType: string;

  /**
   * Metric namespace
   */
  readonly namespace: string;

  /**
   * The recommended default period for this set of metrics
   */
  readonly defaultPeriod?: number;

  /**
   * Set of dimensions for this set of metrics
   */
  readonly dimensions: Dimension[];

  /**
   * Set of metrics these dimensions apply to
   */
  readonly metrics: Metric[];
}

/**
 * Dimension for this set of metric templates
 */
export interface Dimension {
  /**
   * Name of the dimension
   */
  readonly dimensionName: string;

  /**
   * Label for this dimension
   */
  readonly labelName?: string;

  /**
   * A potential fixed value for this dimension
   *
   * (Currently unused by the spec reader, but could be used)
   */
  readonly dimensionValue?: string;
}

/**
 * A description of an available metric
 */
export interface Metric {
  /**
   * Id of the metric
   */
  readonly id: string;
  /**
   * Name of the metric
   */
  readonly name: string;
  /**
   * Default (suggested) statistic for this metric
   */
  readonly defaultStat: string;
  /**
   * Default (suggested) period for this metric
   */
  readonly defaultPeriod?: number;
}

/**
 *
 * !! Here be dragons
 * !! The following types and associated data are not currently used
 *
 */
export interface ResourceType {
  readonly type: string;
  readonly keyMetric: string;
  readonly arnRegex?: string;
  readonly identifyingLabels?: string[];
  readonly describe?: string;
  readonly resourceDecorator?: string;
  readonly metricTransformer?: string;
  readonly consoleLink?: string;
  readonly alarmPatterns?: AlarmPattern[];
  readonly nodeNameRegex?: string;
  readonly dashboard?: string;
  readonly isResourceNode?: boolean;
  readonly entityType?: string;
  readonly list?: string;
  readonly drawerDashboard?: string;
  readonly foreignKeys?: ForeignKey[];
}

export interface AlarmPattern {
  readonly namespace: string;
  readonly dimensions: Dimension[];
}

export interface ForeignKey {
  readonly resourceType: string;
  readonly fields: string[];
}

export interface Control {
  readonly type: string;
  readonly resourceType: string;
  readonly labelField: string;
  readonly valueField: string;
  readonly resourceDashboard?: string;
  readonly serviceDashboard?: string;
}

export interface Dashboard {
  readonly id: string;
  readonly name?: string;
  readonly dependencies?: Dependency[];
  readonly controls?: string[];
  readonly tables?: Table[];
  readonly rows?: Row[];
}

export interface Dependency {
  readonly namespace: string;
}

export interface Table {
  readonly resourceType: string;
  readonly columns: string[];
}

export interface Row {
  readonly widgets: Widget[];
}

export interface Widget {
  readonly type: string;
  readonly width?: number;
  readonly height?: number;
  readonly properties?: WidgetProperties;
  readonly metrics?: WidgetMetric[];
  readonly source?: string;
}

export interface WidgetProperties {
  readonly title?: string;
  readonly legend?: WidgetLegend;
  readonly view?: string;
  readonly yAxis?: WidgetYAxis;
  readonly markdown?: string;
  readonly stat?: string;
  readonly metrics?: Array<Array<string | WidgetMetricOptions>>;
}

export interface WidgetLegend {
  position: string;
}

export interface WidgetYAxis {
  left?: Axis;
  right?: Axis;
}

export interface Axis {
  readonly max?: number;
  readonly min?: number;
  readonly showUnits?: boolean;
  readonly label?: string;
}

export interface WidgetMetric {
  readonly metricTemplate?: string;
  readonly metricOptions?: WidgetMetricOptions;
  readonly metricExpression?: string;
  readonly resourceType?: string | false;
}

export interface WidgetMetricOptions {
  readonly id?: string;
  readonly label?: string;
  readonly visible?: boolean;
  readonly yAxis?: string;
  readonly expression?: string;
  readonly stat?: string;
  readonly period?: number;
  readonly color?: string;
}
