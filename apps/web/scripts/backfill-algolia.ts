import path from "node:path";
import { createClient } from "@sanity/client";
import { algoliasearch } from "algoliasearch";
import { DEFAULT_SANITY_API_VERSION } from "@workspace/env/constants";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(import.meta.dirname, "..", ".env"),
  quiet: true,
});

const {
  NEXT_PUBLIC_SANITY_PROJECT_ID: projectId,
  NEXT_PUBLIC_SANITY_DATASET: dataset,
  SANITY_API_READ_TOKEN: sanityToken,
  ALGOLIA_APP_ID: algoliaAppId,
  ALGOLIA_WRITE_API_KEY: algoliaWriteKey,
  ALGOLIA_INDEX_NAME: algoliaIndexName,
} = process.env;

if (
  !(
    projectId &&
    dataset &&
    sanityToken &&
    algoliaAppId &&
    algoliaWriteKey &&
    algoliaIndexName
  )
) {
  throw new Error(
    "backfill-algolia requires NEXT_PUBLIC_SANITY_PROJECT_ID, NEXT_PUBLIC_SANITY_DATASET, SANITY_API_READ_TOKEN, ALGOLIA_APP_ID, ALGOLIA_WRITE_API_KEY, ALGOLIA_INDEX_NAME"
  );
}

const sanity = createClient({
  projectId,
  dataset,
  token: sanityToken,
  apiVersion: DEFAULT_SANITY_API_VERSION,
  useCdn: false,
});

const algolia = algoliasearch(algoliaAppId, algoliaWriteKey);

type BlogPost = {
  _id: string;
  title: string | null;
  description: string | null;
  slug: string | null;
  category: string | null;
  publishedAt: string | null;
  author: string | null;
};

const posts = await sanity.fetch<BlogPost[]>(
  `*[_type == "blog" && defined(slug.current) && (seoNoIndex != true) && (seoHideFromLists != true)]{
    _id,
    title,
    description,
    "slug": slug.current,
    category,
    publishedAt,
    "author": authors[0]->name
  }`
);

// The blog's own _id becomes the Algolia objectID, so a rerun overwrites the
// same records instead of duplicating them, and Task 3's index-status check
// can look posts up by the same id it already has open in Studio.
const objects = posts.map((post) => ({
  objectID: post._id,
  title: post.title,
  description: post.description,
  slug: post.slug,
  category: post.category,
  publishedAt: post.publishedAt,
  author: post.author,
}));

const results = await algolia.saveObjects({
  indexName: algoliaIndexName,
  objects,
  waitForTasks: true,
});

console.log(
  `Backfilled ${objects.length} posts in ${results.length} batch(es).`
);
