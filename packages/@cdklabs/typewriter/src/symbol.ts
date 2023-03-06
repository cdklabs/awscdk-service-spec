import { Scope } from './scope';

/**
 * Kinds of types.
 */
export enum SymbolKind {
  Class = 'class',
  Enum = 'enum',
  Interface = 'interface',
  Function = 'function',
}

export abstract class Symbol {
  public readonly scope?: Scope;

  /**
   * The kind of the type.
   */
  public abstract readonly kind: SymbolKind;

  constructor(public readonly symbolName: string) {}
}
