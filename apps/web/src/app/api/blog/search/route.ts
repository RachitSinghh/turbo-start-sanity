import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";
import { algoliasearch } from "algoliasearch";
import { cacheLife } from "next/cache";
import { NextResponse } from "next/server";

const logger = new Logger("BlogSearch");

const RESULTS_PER_PAGE = 10;

async function searchAlgolia(query: string, page: number, category: string) {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 60 });

  const algolia = algoliasearch(env.ALGOLIA_APP_ID, env.ALGOLIA_SEARCH_API_KEY);
  return algolia.searchSingleIndex({
    indexName: env.ALGOLIA_INDEX_NAME,
    searchParams: {
      query,
      page,
      hitsPerPage: RESULTS_PER_PAGE,
      filters: category ? `category:"${category}"` : undefined,
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const category = searchParams.get("category") ?? "";

  // Public API param is 1-indexed (page=1 is the first page); Algolia's own
  // `page` is 0-indexed, so the conversion happens right here at the edge.
  const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0
      ? requestedPage - 1
      : 0;

  try {
    const result = await searchAlgolia(query, page, category);
    return NextResponse.json({
      results: result.hits,
      page: (result.page ?? 0) + 1,
      totalPages: result.nbPages ?? 0,
      totalResults: result.nbHits ?? 0,
    });
  } catch (error) {
    logger.error("Algolia search failed", error);
    return NextResponse.json(
      { error: "Search is temporarily unavailable" },
      { status: 503 }
    );
  }
}
