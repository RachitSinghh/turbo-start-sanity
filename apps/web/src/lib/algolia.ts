import { env } from "@workspace/env/server";
import { algoliasearch } from "algoliasearch";

export function getAlgoliaClient() {
  return algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_WRITE_API_KEY);
}

type BlogPostFields = {
  _id: string;
  title: string | null;
  description: string | null;
  slug: string | null;
  category: string | null;
  publishedAt: string | null;
  author: string | null;
};

// Shared by the backfill script and the webhook sync route, so both write
// the exact same record shape under the exact same objectID.
export function blogPostToAlgoliaRecord(post: BlogPostFields) {
  return {
    objectID: post._id,
    title: post.title,
    description: post.description,
    slug: post.slug,
    category: post.category,
    publishedAt: post.publishedAt,
    author: post.author,
  };
}
