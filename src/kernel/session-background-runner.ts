export async function runSessionInBackground<TResult>(input: {
  threadId: string;
  execute: () => Promise<TResult>;
  finalize: (result: TResult) => Promise<void>;
  publishFailure: (threadId: string, errorMessage: string) => void;
}): Promise<void> {
  try {
    const result = await input.execute();
    await input.finalize(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    input.publishFailure(input.threadId, errorMessage);
  }
}
