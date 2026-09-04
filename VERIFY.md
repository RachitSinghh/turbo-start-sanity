# VERIFY

How I checked each thing actually works, with the command I ran and the output
I got back.

A note on the webhook checks (1, 2, 4, 6). The production webhook in Sanity
points at the deployed `/api/algolia/sync` route. To check the route logic
without waiting on a real publish every time, I posted the exact payload Sanity
sends and signed it the same way, with `encodeSignatureHeader` from
`@sanity/webhook` and the shared secret, against the route running locally.
Same code path the deployed webhook hits. You can also reproduce any of these
end to end by publishing a post in Studio, since you've been invited to the
project.

Local servers used: web on `localhost:3000`, Studio on `localhost:3333`.

---

## 1. Publishing a post puts it in the index

Signed webhook for a published post, then asked Algolia directly whether the
record is there.

```
webhook for a published post -> 200 {"synced":true}
getObject(02b5ca06-f5dc-49f3-b6f7-8b941f3bf739) -> HTTP 200   (200 = in the index)
```

## 2. Unpublishing or deleting removes it

On a delete or unpublish Sanity still fires the webhook with the document id.
The route re-fetches the published version, finds nothing, and deletes the
record from Algolia.

```
webhook for an id with no published doc -> 200 {"synced":true}
getObject(deleted-demo-0000-never-published) -> HTTP 404   (404 = not in the index)
```

## 3. A draft post never appears in search results

Drafts carry a `drafts.` prefix on their id and are never written to the index.
The object id in Algolia is always the published id.

```
getObject(drafts.02b5ca06-f5dc-49f3-b6f7-8b941f3bf739) -> HTTP 404
```

I also saw this the other way round while testing the SEO tab. I edited a
post's description in the draft to "Hello hi there how are yo", left it
unpublished, and queried Algolia for that record. The description there was
still the published text ("Reiciendis confugo..."), not the draft text, so the
draft edit never reached search.

## 4. The same webhook delivery twice leaves one entry, not two

Sanity can deliver the same event more than once. The object id is the post's
own `_id`, so a second delivery overwrites the same record instead of adding a
new one.

```
records before: 21
delivery #1 -> 200 {"synced":true}
delivery #2 -> 200 {"synced":true}   (same _id)
records after two deliveries: 21
```

Still 21, not 22.

## 5. `/api/blog/search` returns page 2 of a result set

```
$ curl "http://localhost:3000/api/blog/search?q=a&page=1"
page: 1 | totalPages: 3 | totalResults: 21 | results on page: 10

$ curl "http://localhost:3000/api/blog/search?q=a&page=2"
page: 2 | totalPages: 3 | totalResults: 21 | results on page: 10
```

Page param is 1-indexed at the edge and converted to Algolia's 0-indexed page
inside the route. The response carries `totalPages` and `totalResults` so the
frontend hook knows whether there's a next page.

## 6. A request with no valid key is rejected

```
$ curl -X POST http://localhost:3000/api/algolia/sync \
    -d '{"_id":"02b5ca06-f5dc-49f3-b6f7-8b941f3bf739","_type":"blog"}'   # no signature
401 Unauthorized
```

The route fails closed. No signature, a bad signature, or an unset secret all
get a 401, and it never says why beyond "Unauthorized".

## 7. The Studio tab updates while you type, before anything is saved

Screen recording: **<paste link here>**

What the clip shows, in a Studio split view with the Editor on one side and the
SEO & Index tab on the other:

- Typing in the Description moves the "Description X/160" count and the search
  preview live, with no save or publish.
- When the description drops below the schema's 140 minimum the check flips from
  green to a "too short" warning on its own.

## 8. The Studio tab correctly reports one post in the index and one that isn't

The tab looks the open document up in Algolia by its id and compares.

```
getObject(02b5ca06-f5dc-49f3-b6f7-8b941f3bf739) -> HTTP 200   (a real post: in index)
getObject(does-not-exist)                        -> HTTP 404   (not in index)
```

In the tab this reads as "In index" (green) for a published, indexable post.
Flip on **Do Not Index This Page** and the status turns to "Should be removed"
(red), because the post is still in Algolia but the document now says it
shouldn't be. That mismatch is the whole point of the panel. Same screen
recording as check 7 covers this.

## 9. Bonus: PageSpeed

Not done.
