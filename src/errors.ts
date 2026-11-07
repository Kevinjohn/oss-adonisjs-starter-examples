/**
 * An expected failure with a message for the person running the command. The command-line
 * scripts print the message alone and exit 1; any other error is a bug and keeps its stack.
 */
export class SandboxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SandboxError'
  }
}
