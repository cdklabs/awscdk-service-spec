import {
  Property,
  PropertyScrutinyType,
  Resource,
  ResourceScrutinyType,
  RichSpecDatabase,
  SpecDatabase,
} from '@aws-cdk/service-spec-types';

/**
 * Auto-detect common properties to apply scrutiny to by using heuristics
 *
 * Manually enhancing scrutiny attributes for each property does not scale
 * well. Fortunately, the most important ones follow a common naming scheme and
 * we tag all of them at once in this way.
 *
 * If the heuristic scheme gets it wrong in some individual cases, those can be
 * fixed using schema patches.
 */
export class Scrutinies {
  constructor(private readonly db: SpecDatabase) {}

  public import() {
    for (const res of this.db.all('resource')) {
      res.scrutinizable = this.autoResourceScrutiny(res);

      if (res.scrutinizable ?? ResourceScrutinyType.None !== ResourceScrutinyType.None) {
        continue;
      }

      for (const [name, prop] of Object.entries(res.properties)) {
        prop.scrutinizable = this.autoPropertyScrutiny(name, prop);
      }
    }

    this.addHardCodedScrutinies();
  }

  /**
   * Detect whether this resource needs to be scrutinized in its entirety
   */
  private autoResourceScrutiny(res: Resource): ResourceScrutinyType | undefined {
    // If this resource is named like *Policy and has a PolicyDocument property
    if (
      res.cloudFormationType.endsWith('Policy') &&
      Object.entries(res.properties).some(apply2(isPolicyDocumentProperty))
    ) {
      return isIamType(res.cloudFormationType)
        ? ResourceScrutinyType.IdentityPolicyResource
        : ResourceScrutinyType.ResourcePolicyResource;
    }

    return undefined;
  }

  private autoPropertyScrutiny(propertyName: string, property: Property): PropertyScrutinyType | undefined {
    const richDb = new RichSpecDatabase(this.db);

    // Detect fields named like ManagedPolicyArns
    if (propertyName === 'ManagedPolicyArns') {
      return PropertyScrutinyType.ManagedPolicies;
    }

    if (
      propertyName === 'Policies' &&
      property.type.type === 'array' &&
      richDb.tryFindDef(property.type.element)?.name === 'Policy'
    ) {
      return PropertyScrutinyType.InlineIdentityPolicies;
    }

    if (isPolicyDocumentProperty(propertyName, property)) {
      return PropertyScrutinyType.InlineResourcePolicy;
    }

    return undefined;
  }

  /**
   * Add a number of hardcoded scrutinies that aren't detected by the autodetector
   */
  private addHardCodedScrutinies() {
    this.setResourceScrutiny('AWS::Lambda::Permission', ResourceScrutinyType.LambdaPermission);

    // Called "policy" but not actually IAM policies
    this.setPropertyScrutiny('AWS::SNS::Subscription', 'DeliveryPolicy', PropertyScrutinyType.None);
    this.setPropertyScrutiny('AWS::SNS::Subscription', 'FilterPolicy', PropertyScrutinyType.None);
    this.setPropertyScrutiny('AWS::SQS::Queue', 'RedrivePolicy', PropertyScrutinyType.None);

    // Ingress/egress rules
    this.setResourceScrutiny('AWS::EC2::SecurityGroupIngress', ResourceScrutinyType.IngressRuleResource);
    this.setResourceScrutiny('AWS::EC2::SecurityGroupEgress', ResourceScrutinyType.EgressRuleResource);
    this.setPropertyScrutiny('AWS::EC2::SecurityGroup', 'SecurityGroupIngress', PropertyScrutinyType.IngressRules);
    this.setPropertyScrutiny('AWS::EC2::SecurityGroup', 'SecurityGroupEgress', PropertyScrutinyType.EgressRules);
  }

  private setResourceScrutiny(cfnType: string, scrutiny: ResourceScrutinyType) {
    const res = new RichSpecDatabase(this.db).resourceByType(cfnType, 'setResourceScrutiny');
    res.scrutinizable = scrutiny;
  }

  private setPropertyScrutiny(cfnType: string, propName: string, scrutiny: PropertyScrutinyType) {
    const res = new RichSpecDatabase(this.db).resourceByType(cfnType, 'setPropertyScrutiny');
    const prop = res.properties[propName];
    if (!prop) {
      // Typo protection
      throw new Error(`setPropertyScrutiny: no such property ${cfnType}.${propName}`);
    }
    prop.scrutinizable = scrutiny;
  }
}

/**
 * Detect and assign a scrutiny type for the property
 */
function isIamType(typeName: string) {
  return typeName.indexOf('::IAM::') > 1;
}

/**
 * Return whether the given property looks like a policy document
 *
 * It is a policy document if the name contains the word "Policy", and the type is
 * compatible with a policy document.
 */
function isPolicyDocumentProperty(propertyName: string, property: Property) {
  const nameContainsPolicy = propertyName.indexOf('Policy') > -1;
  const isJson = property.type.type === 'json';

  return nameContainsPolicy && isJson;
}

/**
 * Make a function that takes 2 arguments take an array of 2 elements instead
 *
 * Makes it possible to map it over an array of arrays. TypeScript won't allow
 * me to overload this type declaration so we need a different function for
 * every # of arguments.
 */
function apply2<T1, T2, R>(fn: (a1: T1, a2: T2) => R): (as: [T1, T2]) => R {
  return (as) => fn.apply(fn, as);
}
