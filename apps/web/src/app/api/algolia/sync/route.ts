import { isValidSignature, SIGNATURE_HEADER_NAME } from "@sanity/webhook";
import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";
import { client } from "@workspace/sanity/client";
import { queryBlogPostForAlgoliaSync } from "@workspace/sanity/query";
import { NextResponse } from "next/server";
import { blogPostToAlgoliaRecord, getAlgoliaClient } from "@/lib/algolia";

const logger = new Logger("AlgoliaSync");

// stega must be off here: it injects invisible visual-editing metadata into
// every string field, which is meant for the site's own rendered pages, not
// data forwarded to Algolia (it once inflated a 144-char field past
// Algolia's 10 KB record limit).
const readClient = client.withConfig({
  token: env.SANITY_API_READ_TOKEN,
  stega: false,
});
const algolia = getAlgoliaClient();

const DRAFT_PREFIX = "drafts.";

export async function POST(req: Request) {
  const secret = env.SANITY_WEBHOOK_SECRET;
  const signature = req.headers.get(SIGNATURE_HEADER_NAME);
  const body = await req.text();

  // Fail closed: reject when the shared secret is unset, the signature
  // header is missing, or the signature doesn't match this exact body.
  if (
    !(secret && signature) ||
    !(await isValidSignature(body, signature, secret))
  ) {
    logger.warn("Rejected unsigned/invalid Algolia sync webhook", {
      hasSignature: Boolean(signature),
      secretConfigured: Boolean(secret),
    });
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Bad Request: body must be valid JSON", {
      status: 400,
    });
  }

  const { _id, _type } = (payload ?? {}) as {
    _id?: unknown;
    _type?: unknown;
  };
  if (typeof _id !== "string") {
    return new Response("Bad Request: missing _id", { status: 400 });
  }

  // Content types we don't index (pages, authors, settings, ...) still
  // deliver a webhook call — acknowledge it rather than error, since this
  // isn't a failure and Sanity would otherwise retry a non-2xx response.
  if (_type !== "blog") {
    return NextResponse.json({ ignored: true });
  }

  // Drafts and published documents share the same suffix; always resolve to
  // the published id so a draft-only edit never touches the index, and an
  // unpublish/delete naturally falls through to "no document found" below.
  const publishedId = _id.startsWith(DRAFT_PREFIX)
    ? _id.slice(DRAFT_PREFIX.length)
    : _id;

  try {
    const post = await readClient.fetch(queryBlogPostForAlgoliaSync, {
      id: publishedId,
    });
    if (post && !post.seoNoIndex && !post.seoHideFromLists) {
      await algolia.saveObject({
        indexName: env.ALGOLIA_INDEX_NAME,
        body: blogPostToAlgoliaRecord(post),
      });
    } else {
      await algolia.deleteObject({
        indexName: env.ALGOLIA_INDEX_NAME,
        objectID: publishedId,
      });
    }
  } catch (error) {
    logger.error("Failed to sync blog post to Algolia", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }

  return NextResponse.json({ synced: true });
}
