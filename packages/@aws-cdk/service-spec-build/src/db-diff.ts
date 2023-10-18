import {
  Attribute,
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

  private diffService(a: Service, b: Service): UpdatedService | undefined {
    return collapseUndefined({
      capitalized: diffScalar(a, b, 'capitalized'),
      cloudFormationNamespace: diffScalar(a, b, 'cloudFormationNamespace'),
      name: diffScalar(a, b, 'name'),
      shortName: diffScalar(a, b, 'shortName'),
      resourceDiff: this.diffServiceResources(a, b),
    });
  }

  private diffServiceResources(a: Service, b: Service): UpdatedService['resourceDiff'] {
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

  private diffResource(a: Resource, b: Resource): UpdatedResource | undefined {
    return collapseUndefined({
      cloudFormationTransform: diffScalar(a, b, 'cloudFormationTransform'),
      documentation: diffScalar(a, b, 'documentation'),
      cloudFormationType: diffScalar(a, b, 'cloudFormationType'),
      isStateful: diffScalar(a, b, 'isStateful'),
      identifier: diffField(a, b, 'identifier', jsonEq),
      name: diffScalar(a, b, 'name'),
      scrutinizable: diffScalar(a, b, 'scrutinizable'),
      tagInformation: diffField(a, b, 'tagInformation', jsonEq),
      attributes: collapseEmptyDiff(diffMap(a.attributes, b.attributes, (x, y) => this.diffAttribute(x, y))),
      properties: collapseEmptyDiff(diffMap(a.properties, b.properties, (x, y) => this.diffProperty(x, y))),
      typeDefinitionDiff: this.diffResourceTypeDefinitions(a, b),
    });
  }

  private diffAttribute(a: Attribute, b: Attribute): UpdatedAttribute | undefined {
    const eqType = this.eqType.bind(this);

    const anyDiffs = collapseUndefined({
      documentation: diffScalar(a, b, 'documentation'),
      previousTypes: collapseEmptyDiff(diffList(a.previousTypes ?? [], b.previousTypes ?? [], eqType)),
      type: diffField(a, b, 'type', eqType),
    });

    if (anyDiffs) {
      return { old: a, new: b };
    }
    return undefined;
  }

  private diffProperty(a: Property, b: Property): UpdatedProperty | undefined {
    const eqType = this.eqType.bind(this);

    const anyDiffs = collapseUndefined({
      documentation: diffScalar(a, b, 'documentation'),
      defaultValue: diffScalar(a, b, 'defaultValue'),
      deprecated: diffScalar(a, b, 'deprecated'),
      required: diffScalar(a, b, 'required'),
      scrutinizable: diffScalar(a, b, 'scrutinizable'),
      previousTypes: collapseEmptyDiff(diffList(a.previousTypes ?? [], b.previousTypes ?? [], eqType)),
      type: diffField(a, b, 'type', eqType),
    });

    if (anyDiffs) {
      return { old: a, new: b };
    }
    return undefined;
  }

  private diffResourceTypeDefinitions(a: Resource, b: Resource): UpdatedResource['typeDefinitionDiff'] {
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

  private diffTypeDefinition(a: TypeDefinition, b: TypeDefinition): UpdatedTypeDefinition | undefined {
    return collapseUndefined({
      documentation: diffScalar(a, b, 'documentation'),
      name: diffScalar(a, b, 'name'),
      mustRenderForBwCompat: diffScalar(a, b, 'mustRenderForBwCompat'),
      properties: collapseEmptyDiff(diffMap(a.properties, b.properties, (x, y) => this.diffProperty(x, y))),
    });
  }

  /**
   * Tricky -- we have to deep-compare all the type references which will have different ids in
   * different databases.
   *
   * Solve it by doing a string-render and comparing those (for now).
   */
  private eqType(a: PropertyType, b: PropertyType): boolean {
    const s1 = new RichPropertyType(a).stringify(this.db1, false);
    const s2 = new RichPropertyType(b).stringify(this.db2, false);
    return s1 === s2;
  }
}
