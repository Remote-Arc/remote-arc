// Retry only idempotent D1 reads after a known transient transport failure.
// Never retry writes or daily quota errors: those can duplicate side effects
// or amplify an exhausted quota.
export async function retryTransientD1Read<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/^D1_ERROR:\s*Network connection lost\.?$/i.test(message.trim())) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
    return read();
  }
}
