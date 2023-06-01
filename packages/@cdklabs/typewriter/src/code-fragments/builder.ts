import { ICommentable } from './commentable';

export * as expr from '../expressions/builder';
export * as stmt from '../statements/builder';

export function commentOn<T extends ICommentable>(x: T, ...comments: string[]): T {
  x.withComments(...comments);
  return x;
}
