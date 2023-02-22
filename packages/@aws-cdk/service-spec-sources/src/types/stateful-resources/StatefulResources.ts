export interface StatefulResources {
  readonly ResourceTypes: Record<string, stateful.StatefulResourceAttributes>;
}

export namespace stateful {
  export interface StatefulResourceAttributes {
    readonly DeleteRequiresEmptyResource?: boolean;
  }
}
