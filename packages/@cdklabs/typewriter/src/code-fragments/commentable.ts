export interface ICommentable {
  /**
   * Ordered list of all comments attached to this code fragment.
   */
  readonly _comments_: string[];
  /**
   * Attach comments to this code fragement
   */
  withComments(...comments: string[]): ICommentable;
}

/**
 * An implementation of ICommentable
 *
 * Extend or mix-in this class to fulfill the ICommentable interface.
 */
export class CommentableImpl implements ICommentable {
  private _comments: string[] = [];

  /**
   * Ordered list of all comments attached to this code fragment.
   */
  public get _comments_(): string[] {
    return this._comments;
  }

  /**
   * Attach comments to this code fragement
   */
  public withComments(...comments: string[]): this {
    this._comments = comments;
    return this;
  }
}
