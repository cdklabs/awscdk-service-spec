export class CliError extends Error {
  constructor(msg: string) {
    super(msg);
    Object.setPrototypeOf(this, CliError.prototype);
  }
}

export function handleFailure(error: unknown) {
  process.exitCode = 1;
  console.error();

  // Unexpected error, print error with trace
  if (!(error instanceof CliError)) {
    console.error(error);
    return;
  }

  // Pretty error message
  console.error(error.message);
}
