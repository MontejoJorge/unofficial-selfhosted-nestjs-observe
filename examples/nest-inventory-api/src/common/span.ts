import type { TracerService } from '@nestjs/observe';

type Tags = Record<string, string | number | boolean>;

/**
 * Runs `work` inside a custom span named `name`, tagged with `tags`. Outside a
 * traced operation (startup, a sampled-out request) `createSpan` refuses before
 * calling back, and the work runs on its own. An error rejects the span, which
 * marks it failed, and still reaches the caller.
 */
export async function inSpan<T>(
  tracer: TracerService,
  name: string,
  tags: Tags,
  work: () => T | Promise<T>,
): Promise<T> {
  let started = false;
  try {
    return (await tracer.createSpan(name, (span) => {
      started = true;
      span.addTags(tags);
      return work();
    })) as T;
  } catch (error) {
    if (started) throw error;
    return work();
  }
}
