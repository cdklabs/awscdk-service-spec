export class Reason {
  /**
   * A change that is made to ensure backwards compatibility
   */
  public static backwardsCompat(description?: string) {
    return new Reason(('[Backwards compatibility] ' + description).trim());
  }

  /**
   * Type renames are legal in CFN but illegal in CDK
   * They need to be reverted to ensure backwards compatibility
   */
  public static upstreamTypeNameChange(description?: string) {
    return new Reason(
      (
        '[Backwards compatibility] Undoing upstream type rename. This is legal in CFN but illegal in CDK. ' +
        description
      ).trim(),
    );
  }

  /**
   * Any other reason.
   * @deprecated
   */
  public static other(reason: string) {
    return new Reason(reason);
  }

  /**
   * A suspected issue in the data source
   */
  public static sourceIssue(description: string) {
    return new Reason('[Suspected Data Source Problem] ' + description);
  }

  private constructor(public readonly reason: string) {}
}
