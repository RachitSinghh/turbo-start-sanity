# Notes

## Task 3 — SEO & Index view

**Title length limit: 60 characters.** The schema has no title limit, so I set
one. Google renders result titles in a ~600px box and truncates past it, which
works out to roughly 60 characters for typical latin text. The check is a
warning, not an error — a longer title still works, it just gets cut in search
results. Description bounds are *not* invented: they reuse the blog schema's own
validation (min 140 / max 160 in `apps/studio/schemaTypes/documents/blog.ts`).

**Index comparison respects both flags.** A post is treated as "should be
indexed" only when it is published *and* `seoNoIndex` is off *and*
`seoHideFromLists` is off. This matches exactly what the Task 2 backfill script
and webhook route use to decide what goes into Algolia, so the panel's verdict
can never disagree with what the sync actually does.

**Live updates use `useFormValue`.** The tab reads every field with
`useFormValue([...])`, which subscribes to the form store and re-renders on each
keystroke. The preview, character counts and checks move as the editor types,
before anything is saved or published. The index-status check is the one part
that reflects the last *published* state (Algolia is only written on publish via
the Task 2 webhook), which is what makes the "seoNoIndex set but still in the
index" disagreement meaningful.

**Reading Algolia from Studio: direct with the search-only key.** The component
calls `getObject` with `SANITY_STUDIO_ALGOLIA_SEARCH_API_KEY` rather than
proxying through a web API route. The search-only key is safe to ship in the
Studio bundle — it can only read the index, and the public site already searches
with it. Verified Algolia returns `Access-Control-Allow-Origin: *`, so the
browser call works without a proxy. Never the write key.

**Where it plugs in.** Blog posts are opened through the orderable document list,
not the `.views()` call in `structure.ts` (that one is on the `blogIndex`
singleton). So the tab is added via `defaultDocumentNode` in
`apps/studio/sanity.config.ts`, which applies to every `blog` document however
it is reached.
