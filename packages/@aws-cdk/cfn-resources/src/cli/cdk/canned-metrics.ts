import { DimensionSet, Metric, Resource, Service, SpecDatabase } from '@aws-cdk/service-spec';
import { ClassType, expr, InterfaceType, IScope, Method, Module, stmt, Type } from '@cdklabs/typewriter';
import { metricFunctionName, metricsClassNameFromService } from '../naming/conventions';

/**
 * Generate Canned Metrics
 */
export class CannedMetricsModule extends Module {
  public static forService(db: SpecDatabase, service: Service): CannedMetricsModule {
    const cm = new CannedMetricsModule(db, service);

    for (const r of db.follow('serviceHasMetric', service)) {
      cm.addMetricWithDimensions(r.entity);
    }

    return cm;
  }

  public static forResource(db: SpecDatabase, resource: Resource): CannedMetricsModule {
    const service = db.incoming('hasResource', resource).only().entity;
    const cm = new CannedMetricsModule(db, service);

    for (const r of db.follow('resourceHasMetric', resource)) {
      cm.addMetricWithDimensions(r.entity);
    }

    return cm;
  }

  private metrics: MetricsClass;
  private _hasCannedMetrics: boolean = false;

  private constructor(private readonly db: SpecDatabase, service: Service) {
    super(`${service.name}.canned-metrics`);
    this.metrics = new MetricsClass(this, service);
  }

  public get hasCannedMetrics() {
    return this._hasCannedMetrics;
  }

  /**
   * Add metrics for a given dimension set to the module
   */
  public addMetricWithDimensions(metric: Metric) {
    this._hasCannedMetrics = true;
    const dimensions = this.db.follow('usesDimensionSet', metric).map((m) => m.entity);
    this.metrics.addMetricWithDimensions(metric, dimensions);
  }
}

export class MetricsClass extends ClassType {
  private returnType: InterfaceType;
  constructor(scope: IScope, service: Service) {
    super(scope, {
      export: true,
      name: metricsClassNameFromService(service),
    });

    this.returnType = new InterfaceType(this.scope, {
      name: 'MetricWithDims',
      typeParameters: [{ name: 'D' }],
      properties: [
        {
          name: 'namespace',
          type: Type.STRING,
          immutable: true,
          optional: true,
        },
        {
          name: 'metricName',
          type: Type.STRING,
          immutable: true,
        },
        {
          name: 'statistic',
          type: Type.STRING,
          immutable: true,
        },
        {
          name: 'dimensionsMap',
          type: Type.ambient('D'),
          immutable: true,
        },
      ],
    });
  }

  public addMetricWithDimensions(metric: Metric, dimensionSets: DimensionSet[]) {
    const name = metricFunctionName(metric);

    // Add a unique declaration for each dimension set
    for (const set of dimensionSets) {
      const dimensionsType = dimensionSetType(set);
      this.addMetricMethodDeclaration(name, dimensionsType);
    }

    // If we have more than one dimension set, add a generic declaration
    if (dimensionSets.length >= 1) {
      this.addMetricMethodDeclaration(name, Type.ANY);
    }

    // Add the implementation to the final declaration
    this.methods.at(-1)?.addBody(
      stmt.ret(
        expr.object({
          namespace: expr.lit(metric.namespace),
          metricName: expr.lit(metric.name),
          dimensionsMap: expr.ident('dimensions'),
          statistic: expr.lit(metric.statistic),
        }),
      ),
    );
  }

  private addMetricMethodDeclaration(name: string, dimensionsType: Type): Method {
    return this.addMethod({
      name,
      static: true,
      returnType: Type.fromName(this.scope, this.returnType.name, [dimensionsType]),
      parameters: [
        {
          name: 'dimensions',
          type: dimensionsType,
        },
      ],
    });
  }
}

function dimensionSetType(set: DimensionSet): Type {
  return Type.anonymousInterface(set.dimensions.map(({ name }) => ({ name, type: Type.STRING })));
}
