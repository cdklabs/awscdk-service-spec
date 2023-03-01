import * as jsii from '@jsii/spec';

export type DocsSpec = Omit<jsii.Docs, 'custom' | 'subclassable'>;

export interface Documented {
  readonly docs?: DocsSpec;
}
