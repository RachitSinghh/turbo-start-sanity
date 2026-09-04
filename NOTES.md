# NOTES

## 1. What I built and why

### Newsletter signup (task 1)

A `POST /api/newsletter` route that validates the email and writes a
`subscriber` document. The interesting decision was dedupe. Instead of checking
"does this email exist" and then creating, which loses the race when two
requests arrive together, I derive the document id from the email itself:
`subscriber.<sha256(email)>` with `createIfNotExists`. Two identical signups now
write to the same id, so the second one is a no-op. No query, no lock, no race
window.

I deliberately did not use `Rule.unique()` on the field the way `redirect` does.
That rule runs in the Studio UI when a human edits a field. It does nothing for
a server calling the write API, which is exactly what this route is. It solves a
different problem.

I also had to register the type in `structure.ts`. This repo lists every nav
item explicitly rather than auto-listing document types, so without that line
the schema would exist and the route would work but subscribers would be
invisible in Studio.

### Backfill (task 2a)

A script, `apps/web/scripts/backfill-algolia.ts`, not a route. It is an
admin-only, occasional job, and making it a public route would mean building
auth for it for no reason. It reads every published, indexable post and writes
them with `objectID = post._id`, so a second run overwrites the same records
instead of duplicating them. That id choice matters later: the webhook and the
Studio tab both look posts up by it.

### Webhook sync (task 2b)

`POST /api/algolia/sync`. It verifies the delivery with `isValidSignature` from
`@sanity/webhook` rather than a hand-rolled comparison, and it fails closed: no
secret, no signature, or a bad signature all return 401. On each call it
re-asks Sanity "is there a published post at this id, and is it indexable",
then writes or deletes to match. Because it asks rather than trusting the
payload, a duplicate delivery is harmless and an unpublish falls through to a
delete on its own.

Two flags decide indexability, `seoNoIndex` and `seoHideFromLists`, and I
respect both. More on that in section 2.

### Search rewrite (task 2c)

`/api/blog/search` now queries Algolia instead of loading every post into memory
for Fuse.js. Pagination needed the response to change from a bare array to
`{ results, page, totalPages, totalResults }`, so I updated the
`use-blog-search.ts` hook to match rather than leave it broken. The page param
is 1-indexed at the edge and converted to Algolia's 0-indexed page inside the
route. Only the search-only key is ever used, a short cache sits in front since
every call costs money, and an Algolia failure returns 503, not a 500 that
could leak internals.

### SEO & Index tab (task 3)

A read-only view next to the edit form on every blog post. It has a
search preview with truncation, a set of pass/fail checks, and a live index
status that asks Algolia whether the post is in the index right now and calls
out any disagreement with the document in front of you.

Decisions worth naming:

- It reads live values from `document.displayed`, not `useFormValue`. A view is
  a sibling of the form, not inside its provider, so the form hook throws. The
  displayed document is what the pane hands the view and it re-renders on every
  keystroke, which is what makes the preview and counts move as you type.
- It plugs in through `defaultDocumentNode` in `sanity.config.ts`, not the
  `.views()` call in `structure.ts`. See section 2 for why that hint is a trap.
- The description bounds (140 to 160) come from the blog schema's own
  validation, not a number I picked. The title limit of 60 is one I did pick,
  because the schema has none. Google truncates a title around 600px, roughly 60
  characters, so it is a warning rather than an error.
- The index lookup uses the search-only key straight from the browser. It can
  only read, the public site already searches with it, and I confirmed Algolia
  returns `Access-Control-Allow-Origin: *`, so a proxy route would have been
  extra surface for nothing. The write key never leaves the server.

## 2. What I noticed

This is the section I would actually raise with a teammate.

**The `.views()` hint in the brief points at the wrong document.** The README
says grep `structure.ts` for `.views(` and extend that seam. The only such call
is on the `blogIndex` singleton, the listing page, not on blog posts. Blog posts
open through `orderableDocumentListDeskItem`, which never touches it. Following
the hint literally would put the tab on the listing page. The right seam for
"every blog post however it opens" is `defaultDocumentNode`. I think the hint is
meant to teach the API shape, not the location, but it reads as the location.

**`@sanity/icons` type definitions do not match its runtime.** The per-icon
names like `WarningOutlineIcon` exist in the `.d.ts`, so `tsc` is happy, but the
runtime bundle only exports `Icon` and `icons`. `sanity build` failed on an
import that type-checked clean. This is the kind of thing that only shows up when
you actually build. I dropped the icon dependency and used plain glyphs. I think
this is genuinely a packaging bug in the library, not something deliberate.

**The blog slug is stored with its `/blog/` prefix.** `slug.current` is already
`/blog/some-post`, not `some-post`. It is easy to prepend another `/blog/` and
get a doubled path, which I did once before I looked at the rendered URL. Worth a
comment on the field, since it is not what you would assume.

**Two overlapping SEO flags with no shared helper.** `seoNoIndex` means "keep it
out of search engines" and `seoHideFromLists` means "keep it out of our own
lists". The old Fuse search only respected `seoHideFromLists`, while the brief
talks about `seoNoIndex`. I made the index respect both so the two never
disagree, but the deeper issue is that two flags that so often move together
have no single "is this post public" function, so every caller re-derives it.

**`SANITY_API_WRITE_TOKEN` is required but unread.** The env schema marks it
required and the web app fails to boot without it, yet no runtime code reads it.
So a fresh clone fails for a reason that does not exist. This looks like a
leftover rather than a deliberate guard.

**`useFormValue` inside a view crashes at runtime, not compile time.** Neither
`tsc` nor the build catches it. It only appears the moment you open the tab.
Deliberate on Sanity's part, since views really are outside the form provider,
but it is a sharp edge worth knowing before you reach for the obvious hook.

## 3. What I'd do with more time

- The newsletter dedupe trick cannot handle an email change, since the id is
  derived from the old address. Fine for storing an email, would need a rethink
  for a real profile.
- Pull "is this post public" (`!seoNoIndex && !seoHideFromLists && published`)
  into one helper shared by the backfill, the webhook, and the Studio tab,
  instead of three copies of the same condition.
- Verify the webhook end to end against the deployed site with a real publish,
  rather than the locally signed posts in VERIFY.md. The route logic is the
  same, but the real delivery is what the brief cares about.
- The SEO tab could show more: when the record was last indexed, and a
  field-by-field diff between the document and the Algolia record, not just
  present or absent.
- The PageSpeed bonus.
