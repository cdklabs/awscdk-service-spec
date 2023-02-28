import * as jsii from '@jsii/spec';

export type DocsSpec = Omit<jsii.Docs, 'custom' | 'subclassable' | 'see'>;

export interface Documented {
  readonly docs?: DocsSpec;
}
