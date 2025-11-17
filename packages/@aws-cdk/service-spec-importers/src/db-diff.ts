import {
  Attribute,
  ChangedMetric,
  Metric,
  Property,
  PropertyType,
  Resource,
  RichPropertyType,
  Service,
  SpecDatabase,
  SpecDatabaseDiff,
  TypeDefinition,
  UpdatedAttribute,
  UpdatedProperty,
  UpdatedResource,
  UpdatedService,
  UpdatedTypeDefinition,
  MapDiff,
} from '@aws-cdk/service-spec-types';
import {
  diffByKey,
  collapseUndefined,
  diffScalar,
  collapseEmptyDiff,
  jsonEq,
  diffMap,
  diffList,
  diffField,
  AllFieldsGiven,
} from './diff-helpers';

export class DbDiff {
  constructor(private readonly db1: SpecDatabase, private readonly db2: SpecDatabase) {}

  public diff(): SpecDatabaseDiff {
    return {
      services: diffByKey(
        this.db1.all('service'),
        this.db2.all('service'),
        (service) => service.name,
        (a, b) => this.diffService(a, b),
      ),
    };
  }

  public diffService(a: Service, b: Service): UpdatedService | undefined {
    return collapseUndefined({
      capitalized: diffScalar(a, b, 'capitalized'),
      cloudFormationNamespace: diffScalar(a, b, 'cloudFormationNamespace'),
      name: diffScalar(a, b, 'name'),
      shortName: diffScalar(a, b, 'shortName'),
      metrics: this.diffServiceMetrics(a, b),
      resourceDiff: this.diffServiceResources(a, b),
    } satisfies AllFieldsGiven<UpdatedService>);
  }

  public diffServiceMetrics(a: Service, b: Service): UpdatedService['metrics'] {
    const aMetrics = this.db1.follow('serviceHasMetric', a).map((r) => r.entity);
    const bMetrics = this.db2.follow('serviceHasMetric', b).map((r) => r.entity);
    return this.diffMetrics(aMetrics, bMetrics);
  }

  public diffResourceMetrics(a: Resource, b: Resource): UpdatedResource['metrics'] {
    const aMetrics = this.db1.follow('resourceHasMetric', a).map((r) => r.entity);
    const bMetrics = this.db2.follow('resourceHasMetric', b).map((r) => r.entity);
    return this.diffMetrics(aMetrics, bMetrics);
  }

  public diffMetrics(a: Metric[], b: Metric[]): MapDiff<Metric, ChangedMetric> | undefined {
    return collapseEmptyDiff(
      diffByKey(
        a,
        b,
        (metric) => `${metric.namespace} • ${metric.name}`,
        (x, y) => this.diffMetric(x, y),
      ),
    );
  }

  private diffMetric(a: Metric, b: Metric): ChangedMetric | undefined {
    return collapseUndefined({
      statistic: diffScalar(a, b, 'statistic'),
    } satisfies AllFieldsGiven<ChangedMetric>);
  }

  public diffServiceResources(a: Service, b: Service): UpdatedService['resourceDiff'] {
    const aRes = this.db1.follow('hasResource', a).map((r) => r.entity);
    const bRes = this.db2.follow('hasResource', b).map((r) => r.entity);

    return collapseEmptyDiff(
      diffByKey(
        aRes,
        bRes,
        (resource) => resource.cloudFormationType,
        (x, y) => this.diffResource(x, y),
      ),
    );
  }

  public diffResource(a: Resource, b: Resource): UpdatedResource | undefined {
    return collapseUndefined({
      cloudFormationTransform: diffScalar(a, b, 'cloudFormationTransform'),
      documentation: diffScalar(a, b, 'documentation'),
      cloudFormationType: diffScalar(a, b, 'cloudFormationType'),
      isStateful: diffScalar(a, b, 'isStateful'),
      arnTemplate: diffScalar(a, b, 'arnTemplate'),
      name: diffScalar(a, b, 'name'),
      scrutinizable: diffScalar(a, b, 'scrutinizable'),
      vendedLogs: diffField(a, b, 'vendedLogs', jsonEq),
      tagInformation: diffField(a, b, 'tagInformation', jsonEq),
      primaryIdentifier: collapseEmptyDiff(
        diffList(a.primaryIdentifier ?? [], b.primaryIdentifier ?? [], (x, y) => x === y),
      ),
      attributes: collapseEmptyDiff(diffMap(a.attributes, b.attributes, (x, y) => this.diffAttribute(x, y))),
      properties: collapseEmptyDiff(diffMap(a.properties, b.properties, (x, y) => this.diffProperty(x, y))),
      typeDefinitionDiff: this.diffResourceTypeDefinitions(a, b),
      metrics: this.diffResourceMetrics(a, b),
    } satisfies AllFieldsGiven<UpdatedResource>);
  }

  public diffAttribute(a: Attribute, b: Attribute): UpdatedAttribute | undefined {
    const eqType = this.eqType.bind(this);

    const anyDiffs = collapseUndefined({
      documentation: diffScalar(a, b, 'documentation'),
      previousTypes: collapseEmptyDiff(diffList(a.previousTypes ?? [], b.previousTypes ?? [], eqType)),
      type: diffField(a, b, 'type', eqType),
    } satisfies DontCareAboutTypes<AllFieldsGiven<Attribute>>);

    if (anyDiffs) {
      return { old: a, new: b };
    }
    return undefined;
  }

  public diffProperty(a: Property, b: Property): UpdatedProperty | undefined {
    const eqType = this.eqType.bind(this);

    const anyDiffs = collapseUndefined({
      documentation: diffScalar(a, b, 'documentation'),
      defaultValue: diffScalar(a, b, 'defaultValue'),
      deprecated: diffScalar(a, b, 'deprecated'),
      required: diffScalar(a, b, 'required', false),
      scrutinizable: diffScalar(a, b, 'scrutinizable'),
      previousTypes: collapseEmptyDiff(diffList(a.previousTypes ?? [], b.previousTypes ?? [], eqType)),
      type: diffField(a, b, 'type', eqType),
      causesReplacement: diffScalar(a, b, 'causesReplacement'),
      relationshipRefs: diffField(a, b, 'relationshipRefs', jsonEq),
    } satisfies DontCareAboutTypes<AllFieldsGiven<Property>>);

    if (anyDiffs) {
      return { old: a, new: b };
    }
    return undefined;
  }

  public diffResourceTypeDefinitions(a: Resource, b: Resource): UpdatedResource['typeDefinitionDiff'] {
    const aTypes = this.db1.follow('usesType', a).map((r) => r.entity);
    const bTypes = this.db2.follow('usesType', b).map((r) => r.entity);

    return collapseEmptyDiff(
      diffByKey(
        aTypes,
        bTypes,
        (type) => type.name,
        (x, y) => this.diffTypeDefinition(x, y),
      ),
    );
  }

  public diffTypeDefinition(a: TypeDefinition, b: TypeDefinition): UpdatedTypeDefinition | undefined {
    return collapseUndefined({
      documentation: diffScalar(a, b, 'documentation'),
      name: diffScalar(a, b, 'name'),
      mustRenderForBwCompat: diffScalar(a, b, 'mustRenderForBwCompat'),
      properties: collapseEmptyDiff(diffMap(a.properties, b.properties, (x, y) => this.diffProperty(x, y))),
    } satisfies AllFieldsGiven<UpdatedTypeDefinition>);
  }

  /**
   * Tricky -- we have to deep-compare all the type references which will have different ids in
   * different databases.
   *
   * Solve it by doing a string-render and comparing those (for now).
   */
  private eqType(a: PropertyType, b: PropertyType): boolean {
    const s1 = new RichPropertyType(a).normalize(this.db1).stringify(this.db1, false);
    const s2 = new RichPropertyType(b).normalize(this.db2).stringify(this.db2, false);
    return s1 === s2;
  }
}

export type DontCareAboutTypes<A extends object> = { [k in keyof A]: unknown };
