import {
  ChangedMetric,
  Deprecation,
  MapDiff,
  Metric,
  Property,
  RelationshipRef,
  Resource,
  RichPropertyType,
  ScalarDiff,
  Service,
  SpecDatabase,
  SpecDatabaseDiff,
  TypeDefinition,
  UpdatedProperty,
  UpdatedResource,
  UpdatedService,
  UpdatedTypeDefinition,
  VendedLog,
  Event,
  EventTypeDefinition,
  EventProperty,
  UpdatedEvent,
  UpdatedEventTypeDefinition,
  UpdatedEventProperty,
} from '@aws-cdk/service-spec-types';
import chalk from 'chalk';
import { PrintableTree } from './printable-tree';

const ADDITION = '[+]';
const UPDATE = '[~]';
const REMOVAL = '[-]';
const META_INDENT = 6;

const [OLD_DB, NEW_DB] = [0, 1];

export class DiffFormatter {
  private readonly dbs: SpecDatabase[];

  constructor(db1: SpecDatabase, db2: SpecDatabase) {
    this.dbs = [db1, db2];
  }

  public format(diff: SpecDatabaseDiff): string {
    const tree = new PrintableTree();

    tree.addBullets(
      this.renderMapDiff(
        diff.services,
        (s, db) => this.renderService(s, db),
        (k, u) => this.renderUpdatedService(k, u),
      ),
    );

    return tree.toString();
  }

  private renderService(s: Service, db: number): PrintableTree {
    return new PrintableTree(`service ${s.name}`).addBullets([
      new PrintableTree(...listFromProps(s, ['capitalized', 'cloudFormationNamespace', 'name', 'shortName'])).indent(
        META_INDENT,
      ),
      listWithCaption(
        'resources',
        [...this.dbs[db].follow('hasResource', s)]
          .sort(sortByKey((e) => e.entity.name))
          .map((e) => this.renderResource(e.entity, db).prefix([' '])),
      ),
      listWithCaption(
        'metrics',
        [...this.dbs[db].follow('serviceHasMetric', s)]
          .sort(sortByKey((e) => e.entity.name))
          .map((e) => this.renderMetric(e.entity).prefix([' '])),
      ),
    ]);
  }

  private renderUpdatedService(key: string, s: UpdatedService): PrintableTree {
    const d = pick(s, ['capitalized', 'cloudFormationNamespace', 'name', 'shortName']);

    const bullets = [
      new PrintableTree(...listFromDiffs(d)).indent(META_INDENT),
      listWithCaption(
        'resources',
        this.renderMapDiff(
          s.resourceDiff,
          (r, db) => this.renderResource(r, db).prefix([' ']),
          (k, u) => this.renderUpdatedResource(k, u).prefix([' ']),
        ),
      ),
      listWithCaption(
        'metrics',
        this.renderMapDiff(
          s.metrics,
          (m) => this.renderMetric(m).prefix([' ']),
          (k, u) => this.renderUpdatedMetric(k, u).prefix([' ']),
        ),
      ),
    ];

    const ret = new PrintableTree(`service ${key}`).addBullets(bullets);
    return ret;
  }

  private renderResource(r: Resource, db: number): PrintableTree {
    return new PrintableTree(`resource ${r.cloudFormationType}`).addBullets([
      new PrintableTree(
        ...listFromProps(r, [
          'name',
          'cloudFormationType',
          'cloudFormationTransform',
          'documentation',
          'isStateful',
          'scrutinizable',
          'tagInformation',
          'arnTemplate',
          'vendedLogs',
        ]),
      ).indent(META_INDENT),
      listWithCaption('properties', this.renderProperties(r.properties, db)),
      listWithCaption('attributes', this.renderProperties(r.attributes, db)),
      listWithCaption(
        'types',
        [...this.dbs[db].follow('usesType', r)]
          .sort(sortByKey((e) => e.entity.name))
          .map((e) => this.renderTypeDefinition(e.entity, db).prefix([' '])),
      ),
      listWithCaption(
        'metrics',
        [...this.dbs[db].follow('resourceHasMetric', r)]
          .sort(sortByKey((e) => e.entity.name))
          .map((e) => this.renderMetric(e.entity).prefix([' '])),
      ),
      listWithCaption(
        'events',
        [...this.dbs[db].follow('resourceHasEvent', r)]
          .sort(sortByKey((e) => e.entity.name))
          .map((e) => this.renderEvent(e.entity, db).prefix([' '])),
      ),
    ]);
  }

  private renderUpdatedResource(key: string, r: UpdatedResource): PrintableTree {
    const d = pick(r, [
      'name',
      'cloudFormationType',
      'cloudFormationTransform',
      'documentation',
      'isStateful',
      'scrutinizable',
      'tagInformation',
      'arnTemplate',
    ]);

    return new PrintableTree(`resource ${key}`).addBullets([
      new PrintableTree(...listFromDiffs(d)).indent(META_INDENT),
      listWithCaption('properties', this.renderPropertyDiff(r.properties)),
      listWithCaption('attributes', this.renderPropertyDiff(r.attributes)),
      listWithCaption('vendedLogs', this.renderVendedLogsDiff(r.vendedLogs)),
      listWithCaption(
        'types',
        this.renderMapDiff(
          r.typeDefinitionDiff,
          (t, db) => this.renderTypeDefinition(t, db).prefix([' ']),
          (k, u) => this.renderUpdatedTypeDefinition(k, u),
        ),
      ),
      listWithCaption(
        'metrics',
        this.renderMapDiff(
          r.metrics,
          (m) => this.renderMetric(m).prefix([' ']),
          (k, u) => this.renderUpdatedMetric(k, u).prefix([' ']),
        ),
      ),
      listWithCaption(
        'events',
        this.renderMapDiff(
          r.events,
          (e, db) => this.renderEvent(e, db).prefix([' ']),
          (k, u) => this.renderUpdatedEvent(k, u).prefix([' ']),
        ),
      ),
    ]);
  }

  private renderTypeDefinition(t: TypeDefinition, db: number): PrintableTree {
    return new PrintableTree(`type ${t.name}`).addBullets([
      new PrintableTree(...listFromProps(t, ['documentation', 'mustRenderForBwCompat', 'name'])).indent(META_INDENT),
      listWithCaption('properties', this.renderProperties(t.properties, db)),
    ]);
  }

  private renderUpdatedTypeDefinition(key: string, t: UpdatedTypeDefinition): PrintableTree {
    const d = pick(t, ['documentation', 'mustRenderForBwCompat', 'name']);
    return new PrintableTree(`type ${key}`).addBullets([
      new PrintableTree(...listFromDiffs(d)).indent(META_INDENT),
      listWithCaption('properties', this.renderPropertyDiff(t.properties)),
    ]);
  }

  private renderMetric(m: Metric): PrintableTree {
    return new PrintableTree(`${m.namespace} • ${m.name} • ${m.statistic}`);
  }

  private renderUpdatedMetric(k: string, u: ChangedMetric): PrintableTree {
    return new PrintableTree(k).addBullets([
      new PrintableTree(...listFromDiffs(pick(u, ['statistic']))).indent(META_INDENT),
    ]);
  }
  private formatRelRefs(refs?: RelationshipRef[]): string {
    if (!refs?.length) return 'undefined';
    return `[${refs.map((r) => `${r.cloudFormationType}.${r.propertyName}`).join(', ')}]`;
  }

  private renderProperty(p: Property, db: number): PrintableTree {
    const ret = new PrintableTree();

    const types = [p.type, ...(p.previousTypes ?? []).reverse()];
    ret.emit(types.map((type) => new RichPropertyType(type).stringify(this.dbs[db], false)).join(' ⇐ '));

    const attributes = [];
    if (p.required) {
      attributes.push('required');
    }

    if (p.defaultValue) {
      attributes.push(`default=${render(p.defaultValue)}`);
    }
    if (p.deprecated && p.deprecated !== Deprecation.NONE) {
      attributes.push(`deprecated=${p.deprecated}`);
    }
    if (p.causesReplacement === 'yes') {
      attributes.push('immutable');
    }
    if (p.causesReplacement === 'maybe') {
      attributes.push('immutable?');
    }

    // Documentation and relationship changes are rendered outside, they'll be too large

    if (attributes.length) {
      ret.emit(` (${attributes.join(', ')})`);
    }

    return ret;
  }

  private renderProperties(ps: Record<string, Property>, db: number): PrintableTree[] {
    return Object.entries(ps).map(([name, p]) => this.renderProperty(p, db).prefix([' ', `${name}: `]));
  }

  private renderMapDiff<E, U>(
    diff: MapDiff<E, U> | undefined,
    renderEl: (x: E, dbI: number) => PrintableTree,
    renderUpdated: (key: string, x: U) => PrintableTree,
  ): PrintableTree[] {
    if (!diff) {
      return [];
    }

    // Turn the lists into maps
    const keys = Array.from(
      new Set([
        ...Object.keys(diff.added ?? {}),
        ...Object.keys(diff.removed ?? {}),
        ...Object.keys(diff.updated ?? {}),
      ]),
    );
    keys.sort((a, b) => a.localeCompare(b));

    return keys.map((key) => {
      if (diff.added?.[key]) {
        return renderEl(diff.added?.[key]!, NEW_DB).prefix([chalk.green(ADDITION), ' '], [' ']);
      } else if (diff.removed?.[key]) {
        return renderEl(diff.removed?.[key]!, OLD_DB).prefix([chalk.red(REMOVAL), ' '], [' ']);
      } else if (diff.updated?.[key]) {
        return renderUpdated(key, diff.updated?.[key]!).prefix([chalk.yellow(UPDATE), ' '], [' ']);
      }
      return new PrintableTree();
    });
  }

  private renderPropertyDiff(diff: MapDiff<Property, UpdatedProperty> | undefined): PrintableTree[] {
    if (!diff) {
      return [];
    }

    // Turn the lists into maps
    const keys = Array.from(
      new Set([
        ...Object.keys(diff.added ?? {}),
        ...Object.keys(diff.removed ?? {}),
        ...Object.keys(diff.updated ?? {}),
      ]),
    );
    keys.sort((a, b) => a.localeCompare(b));

    return keys.flatMap((key) => {
      const header = [' ', key, ': '];
      const rest = [' ', ' '.repeat(key.length), '  '];

      if (diff.added?.[key]) {
        return [
          this.renderProperty(diff.added?.[key]!, NEW_DB).prefix([chalk.green(ADDITION), ...header], [' ', ...rest]),
        ];
      } else if (diff.removed?.[key]) {
        return [
          this.renderProperty(diff.removed?.[key]!, OLD_DB).prefix([chalk.red(REMOVAL), ...header], [' ', ...rest]),
        ];
      } else if (diff.updated?.[key]) {
        const pu = diff.updated?.[key]!;
        const old = this.renderProperty(pu.old, OLD_DB);
        const noo = this.renderProperty(pu.new, NEW_DB);

        const ret = new PrintableTree();
        if (old.toString() !== noo.toString()) {
          ret.addTree(old.prefix(['- ']).colorize(chalk.red));
          ret.addTree(noo.prefix(['+ ']).colorize(chalk.green));
        }
        if (pu.old.documentation !== pu.new.documentation) {
          ret.addTree(new PrintableTree('(documentation changed)'));
        }

        const oldRefs = this.formatRelRefs(pu.old.relationshipRefs);
        const newRefs = this.formatRelRefs(pu.new.relationshipRefs);
        if (oldRefs !== newRefs) {
          ret.addTree(new PrintableTree(`- relationshipRefs: ${oldRefs}`).colorize(chalk.red));
          ret.addTree(new PrintableTree(`+ relationshipRefs: ${newRefs}`).colorize(chalk.green));
        }
        return ret.prefix([` ${key}: `]);
      }
      return new PrintableTree();
    });
  }

  private renderVendedLogsDiff(diff: ScalarDiff<VendedLog | undefined> | undefined): PrintableTree[] {
    if (!diff || (!diff.old && !diff.new)) {
      return [];
    }
    const tree: PrintableTree[] = [];

    if (!diff.old && diff.new) {
      return [this.renderVendedLogsType(diff.new).prefix([chalk.green(ADDITION), ' '], [' '])];
    }
    if (diff.old && !diff.new) {
      return [this.renderVendedLogsType(diff.old).prefix([chalk.red(REMOVAL), ' '], [' '])];
    }

    if (diff.old && diff.new) {
      if (diff.old.permissionsVersion !== diff.new.permissionsVersion) {
        tree.push(
          new PrintableTree(`permissionsVersion:`).addBullets([
            new PrintableTree(`- ${diff.old.permissionsVersion}`).colorize(chalk.red),
            new PrintableTree(`+ ${diff.new.permissionsVersion}`).colorize(chalk.green),
          ]),
        );
      }

      this.renderVendedLogListDiff(diff, tree, 'logTypes');
      this.renderVendedLogListDiff(diff, tree, 'destinations');
    }
    return tree;
  }

  private renderVendedLogsType(vendedLogs: VendedLog): PrintableTree {
    return new PrintableTree(`vendedLogs`).addBullets([
      new PrintableTree(`permissionsVersion: ${vendedLogs.permissionsVersion}`),
      new PrintableTree(`logTypes: [${vendedLogs.logTypes.join(', ')}]`),
      new PrintableTree(`destinations: [${vendedLogs.destinations.join(', ')}]`),
    ]);
  }

  private renderVendedLogListDiff(diff: ScalarDiff<VendedLog | undefined>, tree: PrintableTree[], diffShown: string) {
    if (diff.old && diff.new) {
      // the array should correspond to the value of diffShown
      const oldList = new Set(diffShown === 'logTypes' ? diff.new.logTypes : diff.new.destinations);
      const newList = new Set(diffShown === 'logTypes' ? diff.new.logTypes : diff.new.destinations);
      const added = [...newList].filter((t) => !oldList.has(t));
      const removed = [...oldList].filter((t) => !newList.has(t));
      if (added.length > 0 || removed.length > 0) {
        const bullets: PrintableTree[] = [];
        removed.forEach((obj) => bullets.push(new PrintableTree(`- ${obj}`).colorize(chalk.red)));
        added.forEach((obj) => bullets.push(new PrintableTree(`+ ${obj}`).colorize(chalk.green)));
        tree.push(new PrintableTree(`${diffShown}:`).addBullets(bullets));
      }
    }
  }

  private renderEvent(e: Event, db: number): PrintableTree {
    const propsTree = new PrintableTree(
      `description: ${render(e.description)}`,
      `source: ${render(e.source)}`,
      `detailType: ${render(e.detailType)}`,
    );

    const rootTypeDef = this.dbs[db].get('eventTypeDefinition', e.rootProperty.$ref);
    propsTree.emit(`\nrootProperty: ${rootTypeDef.name}`);

    if (e.resourcesField && e.resourcesField.length > 0) {
      const resourceFields = e.resourcesField
        .map((rf) => {
          const typeDef = this.dbs[db].get('eventTypeDefinition', rf.type.$ref);
          return rf.fieldName ? `${typeDef.name}.${rf.fieldName}` : typeDef.name;
        })
        .join(', ');
      propsTree.emit(`\nresourcesField: [${resourceFields}]`);
    }

    return new PrintableTree(`event ${e.name}`).addBullets([
      propsTree.indent(META_INDENT),
      listWithCaption(
        'types',
        [...this.dbs[db].follow('eventUsesType', e)]
          .sort(sortByKey((t) => t.entity.name))
          .map((t) => this.renderEventTypeDefinition(t.entity, db).prefix([' '])),
      ),
    ]);
  }

  private renderUpdatedEvent(key: string, e: UpdatedEvent): PrintableTree {
    const bullets: PrintableTree[] = [];

    const simpleDiffs = pick(e, ['name', 'description', 'source', 'detailType']);
    const simpleTree = new PrintableTree(...listFromDiffs(simpleDiffs));

    if (e.rootProperty && e.rootProperty.old && e.rootProperty.new) {
      const oldTypeDef = this.dbs[OLD_DB].get('eventTypeDefinition', e.rootProperty.old.$ref);
      const newTypeDef = this.dbs[NEW_DB].get('eventTypeDefinition', e.rootProperty.new.$ref);
      simpleTree.emit(`\n${chalk.red(`- rootProperty: ${oldTypeDef.name}`)}`);
      simpleTree.emit(`\n${chalk.green(`+ rootProperty: ${newTypeDef.name}`)}`);
    }

    if (e.resourcesField) {
      if (e.resourcesField.old && e.resourcesField.old.length > 0) {
        const oldFields = e.resourcesField.old
          .map((rf) => {
            const typeDef = this.dbs[OLD_DB].get('eventTypeDefinition', rf.type.$ref);
            return rf.fieldName ? `${typeDef.name}.${rf.fieldName}` : typeDef.name;
          })
          .join(', ');
        simpleTree.emit(`\n${chalk.red(`- resourcesField: [${oldFields}]`)}`);
      }
      if (e.resourcesField.new && e.resourcesField.new.length > 0) {
        const newFields = e.resourcesField.new
          .map((rf) => {
            const typeDef = this.dbs[NEW_DB].get('eventTypeDefinition', rf.type.$ref);
            return rf.fieldName ? `${typeDef.name}.${rf.fieldName}` : typeDef.name;
          })
          .join(', ');
        simpleTree.emit(`\n${chalk.green(`+ resourcesField: [${newFields}]`)}`);
      }
    }

    bullets.push(simpleTree.indent(META_INDENT));

    bullets.push(
      listWithCaption(
        'types',
        this.renderMapDiff(
          e.typeDefinitionDiff,
          (t, db) => this.renderEventTypeDefinition(t, db).prefix([' ']),
          (k, u) => this.renderUpdatedEventTypeDefinition(k, u),
        ),
      ),
    );

    return new PrintableTree(`event ${key}`).addBullets(bullets);
  }

  private renderEventTypeDefinition(t: EventTypeDefinition, db: number): PrintableTree {
    return new PrintableTree(`type ${t.name}`).addBullets([
      listWithCaption('properties', this.renderEventProperties(t.properties, db)),
    ]);
  }

  private renderUpdatedEventTypeDefinition(key: string, t: UpdatedEventTypeDefinition): PrintableTree {
    const d = pick(t, ['name']);
    return new PrintableTree(`type ${key}`).addBullets([
      new PrintableTree(...listFromDiffs(d)).indent(META_INDENT),
      listWithCaption('properties', this.renderEventPropertyDiff(t.properties)),
    ]);
  }

  private renderEventProperty(p: EventProperty, db: number): PrintableTree {
    const ret = new PrintableTree();
    ret.emit(this.stringifyEventPropertyType(p.type, this.dbs[db]));

    const attributes = [];
    if (p.required) {
      attributes.push('required');
    }

    if (attributes.length) {
      ret.emit(` (${attributes.join(', ')})`);
    }

    return ret;
  }

  private stringifyEventPropertyType(type: EventProperty['type'], db: SpecDatabase): string {
    if (type.type === 'string') return 'string';
    if (type.type === 'number') return 'number';
    if (type.type === 'integer') return 'integer';
    if (type.type === 'boolean') return 'boolean';
    if (type.type === 'json') return 'json';
    if (type.type === 'date-time') return 'date-time';
    if (type.type === 'null') return 'null';
    if (type.type === 'tag') return 'tag';
    if (type.type === 'ref') {
      const entity = db.get('eventTypeDefinition', type.reference.$ref);
      return entity.name;
    }
    if (type.type === 'array') {
      return `${this.stringifyEventPropertyType(type.element, db)}[]`;
    }
    if (type.type === 'map') {
      return `Map<${this.stringifyEventPropertyType(type.element, db)}>`;
    }
    if (type.type === 'union') {
      const types = type.types.map((t) => this.stringifyEventPropertyType(t, db));
      return types.join(' | ');
    }
    return 'unknown';
  }

  private renderEventProperties(ps: Record<string, EventProperty>, db: number): PrintableTree[] {
    return Object.entries(ps).map(([name, p]) => this.renderEventProperty(p, db).prefix([' ', `${name}: `]));
  }

  private renderEventPropertyDiff(diff?: MapDiff<EventProperty, UpdatedEventProperty>): PrintableTree[] {
    if (!diff) {
      return [];
    }

    const keys = Array.from(
      new Set([
        ...Object.keys(diff.added ?? {}),
        ...Object.keys(diff.removed ?? {}),
        ...Object.keys(diff.updated ?? {}),
      ]),
    );
    keys.sort((a, b) => a.localeCompare(b));

    return keys.flatMap((key) => {
      const header = [' ', key, ': '];
      const rest = [' ', ' '.repeat(key.length), '  '];

      if (diff.added?.[key]) {
        return [
          this.renderEventProperty(diff.added?.[key]!, NEW_DB).prefix(
            [chalk.green(ADDITION), ...header],
            [' ', ...rest],
          ),
        ];
      } else if (diff.removed?.[key]) {
        return [
          this.renderEventProperty(diff.removed?.[key]!, OLD_DB).prefix(
            [chalk.red(REMOVAL), ...header],
            [' ', ...rest],
          ),
        ];
      } else if (diff.updated?.[key]) {
        const pu = diff.updated?.[key]!;
        const old = this.renderEventProperty(pu.old, OLD_DB);
        const noo = this.renderEventProperty(pu.new, NEW_DB);

        const ret = new PrintableTree();
        if (old.toString() !== noo.toString()) {
          ret.addTree(old.prefix(['- ']).colorize(chalk.red));
          ret.addTree(noo.prefix(['+ ']).colorize(chalk.green));
        }
        return ret.prefix([` ${key}: `]);
      }
      return new PrintableTree();
    });
  }
}

function listFromProps<A extends object, K extends keyof A>(a: A, ks: K[]) {
  return listFromObj(pick(a, ks));
}

function listFromObj(xs: Record<string, unknown>): string[] {
  return Object.entries(xs).map(([k, v]) => `${String(k)}: ${render(v)}`);
}

function pick<A extends object, K extends keyof A>(a: A, ks: K[]): Pick<A, K> {
  const pairs = ks.flatMap((k) => (a[k] !== undefined ? [[k, a[k]] as const] : []));
  return Object.fromEntries(pairs) as any;
}

function listFromDiffs(xs: Record<string, ScalarDiff<any> | undefined>): string[] {
  return Object.entries(xs).flatMap(([key, diff]) => [
    chalk.red(`- ${String(key)}: ${render(diff?.old)}`),
    chalk.green(`+ ${String(key)}: ${render(diff?.new)}`),
  ]);
}

function render(x: unknown) {
  return typeof x === 'object' ? JSON.stringify(x) : `${x}`;
}

function listWithCaption(caption: string, trees: PrintableTree[]) {
  trees = trees.filter((t) => !t.empty);
  if (trees.length === 0) {
    return new PrintableTree();
  }
  const ret = new PrintableTree(`${caption}`);
  ret.addBullets(trees);
  return ret.prefix([' '], ['  ']);
}

function sortByKey<T>(keyFn: (x: T) => string): (a: T, b: T) => number {
  return (a, b) => keyFn(a).localeCompare(keyFn(b));
}
