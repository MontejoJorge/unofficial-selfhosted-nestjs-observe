import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:public';

/**
 * Opts a controller or route out of the session check of `SessionAuthGuard`: health,
 * sign-in itself, and the ingest routes (authenticated by API key instead).
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
