import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useDebounce } from "@/hooks/use-debounce";
import type { Blog } from "@/types";

const SEARCH_DEBOUNCE_MS = 400;
const CACHE_STALE_TIME_MS = 30_000;

type AlgoliaHit = {
  objectID: string;
  title: string | null;
  description: string | null;
  slug: string | null;
  category: string | null;
  publishedAt: string | null;
  author: string | null;
};

type SearchApiResponse = {
  results: AlgoliaHit[];
  page: number;
  totalPages: number;
  totalResults: number;
};

type SearchResult = {
  blogs: Blog[];
  page: number;
  totalPages: number;
  totalResults: number;
};

const EMPTY_RESULT: SearchResult = {
  blogs: [],
  page: 1,
  totalPages: 0,
  totalResults: 0,
};

// Algolia hits carry a flatter shape than the Sanity-generated `Blog` type
// (a plain `author` string, no image) — BlogCard only reads name/image off
// `authors` and tolerates a missing image with a placeholder, so this is a
// safe, deliberately partial fit, not a full Blog.
function toBlog(hit: AlgoliaHit): Blog {
  return {
    _id: hit.objectID,
    title: hit.title,
    description: hit.description,
    slug: hit.slug,
    category: hit.category,
    publishedAt: hit.publishedAt,
    authors: hit.author ? { name: hit.author, image: null } : null,
  } as Blog;
}

async function searchBlog(
  query: string,
  page: number,
  category: string,
  signal: AbortSignal
): Promise<SearchResult> {
  if (!query.trim()) {
    return EMPTY_RESULT;
  }

  const params = new URLSearchParams({ q: query, page: String(page) });
  if (category) {
    params.set("category", category);
  }

  const response = await fetch(`/api/blog/search?${params}`, { signal });

  if (!response.ok) {
    throw new Error("Failed to search");
  }

  const data = (await response.json()) as SearchApiResponse;
  return {
    blogs: data.results.map(toBlog),
    page: data.page,
    totalPages: data.totalPages,
    totalResults: data.totalResults,
  };
}

export function useBlogSearch() {
  const [searchQuery, setSearchQueryState] = useState("");
  const [category, setCategoryState] = useState("");
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  const hasQuery = debouncedQuery.trim().length > 0;
  const { data, isLoading, error } = useQuery({
    queryKey: ["blog-search", debouncedQuery, category, page],
    queryFn: ({ signal }) => searchBlog(debouncedQuery, page, category, signal),
    enabled: hasQuery,
    staleTime: CACHE_STALE_TIME_MS,
  });

  const result = data ?? EMPTY_RESULT;

  function setSearchQuery(value: string) {
    setSearchQueryState(value);
    setPage(1);
  }

  function setCategory(value: string) {
    setCategoryState(value);
    setPage(1);
  }

  return {
    searchQuery,
    setSearchQuery,
    category,
    setCategory,
    page,
    setPage,
    totalPages: result.totalPages,
    totalResults: result.totalResults,
    results: result.blogs,
    isSearching: isLoading,
    error,
    hasQuery,
  };
}
