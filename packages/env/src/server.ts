import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod/v4";

const env = createEnv({
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },

  server: {
    SANITY_API_READ_TOKEN: z.string().min(1),
    SANITY_API_WRITE_TOKEN: z.string().min(1),
    // Shared secret for the `/api/revalidate-sync-tags` webhook. Optional so
    // existing deployments still boot; the webhook fails closed when unset.
    SANITY_REVALIDATE_SECRET: z.string().min(1).optional(),
    // Shared secret Sanity signs the `/api/algolia/sync` webhook with.
    // Optional so existing deployments still boot; the route fails closed
    // when unset, same as SANITY_REVALIDATE_SECRET above.
    SANITY_WEBHOOK_SECRET: z.string().min(1).optional(),
    ALGOLIA_APP_ID: z.string().min(1),
    ALGOLIA_INDEX_NAME: z.string().min(1),
    ALGOLIA_WRITE_API_KEY: z.string().min(1),
  },

  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
  },

  // Treat empty env strings (e.g. `SANITY_REVALIDATE_SECRET=` in .env.example)
  // as unset, so `.optional()` vars don't fail `.min(1)` on a blank value.
  emptyStringAsUndefined: true,

  extends: [vercel()],
});

export { env };
