import { Inject, Injectable } from '@nestjs/common';
import {
  APP_VERSION,
  ReleaseSource,
  type LatestRelease,
} from '../application/ports.js';

/** Where the collector's releases are published. */
export const GITHUB_REPOSITORY =
  'MontejoJorge/unofficial-selfhosted-nestjs-observe';

const releasesPage = (repository: string) =>
  `https://github.com/${repository}/releases`;

/** Release page of a tag (`.../releases/tag/v1.1.0`) -> its repository's releases page. */
export function releasesPageOf(releaseUrl: string): string | null {
  const match = /^(https:\/\/github\.com\/[^/]+\/[^/]+\/releases)\/tag\//.exec(
    releaseUrl,
  );
  return match ? match[1] : null;
}

const TIMEOUT_MS = 10_000;

/**
 * Reads a `GET /repos/{owner}/{repo}/releases/latest` body. Throws when it doesn't look
 * like a release, so a changed or proxied answer is reported instead of stored.
 */
export function parseLatestRelease(body: unknown): LatestRelease {
  const release = (body ?? {}) as Record<string, unknown>;
  const { tag_name, html_url, published_at } = release;
  if (typeof tag_name !== 'string' || typeof html_url !== 'string')
    throw new Error('GitHub answered with something that is not a release');
  const publishedAt =
    typeof published_at === 'string' ? new Date(published_at) : null;
  return {
    version: tag_name,
    url: html_url,
    publishedAt:
      publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
  };
}

/**
 * Latest non-draft, non-prerelease GitHub release of the repository, without a token (60 requests per hour per IP, far above two every 6 hours).
 */
@Injectable()
export class GithubReleaseSource extends ReleaseSource {
  constructor(@Inject(APP_VERSION) private readonly version: string) {
    super();
  }

  releasesUrl(latest: LatestRelease | null): string {
    return (
      (latest && releasesPageOf(latest.url)) ?? releasesPage(GITHUB_REPOSITORY)
    );
  }

  /** Null on 404: nothing released, or no such repository. */
  async latest(): Promise<LatestRelease | null> {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `unofficial-selfhosted-nestjs-observe/${this.version}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(
        `GitHub answered ${response.status} ${response.statusText}`.trim(),
      );
    return parseLatestRelease(await response.json());
  }
}
