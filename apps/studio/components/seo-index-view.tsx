import {
  Badge,
  type BadgeTone,
  Box,
  Card,
  type CardTone,
  Container,
  Flex,
  Heading,
  Stack,
  Text,
} from "@sanity/ui";
import { algoliasearch } from "algoliasearch";
import { useEffect, useState } from "react";
import type { UserViewComponent } from "sanity/structure";

// Google truncates a result title at roughly 600px, about 60 characters, and a
// description around 160. The description bounds come straight from the blog
// schema's own validation (min 140 / max 160 in blog.ts) rather than a number
// invented here; the title limit is justified in NOTES.md.
const TITLE_LIMIT = 60;
const DESC_MIN = 140;
const DESC_MAX = 160;

const SITE_URL =
  process.env.SANITY_STUDIO_PRESENTATION_URL ?? "http://localhost:3000";

// Search-only key — safe to ship in the Studio bundle, it can only read the
// index (the public site already searches with it). Never the write key.
const appId = process.env.SANITY_STUDIO_ALGOLIA_APP_ID;
const searchKey = process.env.SANITY_STUDIO_ALGOLIA_SEARCH_API_KEY;
const indexName = process.env.SANITY_STUDIO_ALGOLIA_INDEX_NAME;
const algolia = appId && searchKey ? algoliasearch(appId, searchKey) : null;

type ImageValue = { asset?: { _ref?: string } } | undefined;
type BlogDoc = {
  title?: string;
  seoTitle?: string;
  description?: string;
  seoDescription?: string;
  image?: ImageValue;
  seoImage?: ImageValue;
  seoNoIndex?: boolean;
  seoHideFromLists?: boolean;
  slug?: { current?: string };
};
type IndexState = "loading" | "present" | "absent" | "error";
type CheckTone = "positive" | "caution" | "critical";
type CheckResult = { tone: CheckTone; text: string };

const hasAsset = (img: ImageValue) => Boolean(img?.asset?._ref);

const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;

const CHECK_GLYPH: Record<CheckTone, string> = {
  positive: "✓",
  caution: "⚠",
  critical: "✕",
};

function titleCheck(effectiveTitle: string): CheckResult[] {
  if (!effectiveTitle) {
    return [
      {
        tone: "critical",
        text: "No meta title — set an SEO title or a post title",
      },
    ];
  }
  const set: CheckResult = { tone: "positive", text: "Meta title is set" };
  if (effectiveTitle.length > TITLE_LIMIT) {
    return [
      set,
      {
        tone: "caution",
        text: `Title is ${effectiveTitle.length} chars, over ${TITLE_LIMIT} — search engines will truncate it`,
      },
    ];
  }
  return [
    set,
    {
      tone: "positive",
      text: `Title length is fine (${effectiveTitle.length}/${TITLE_LIMIT})`,
    },
  ];
}

function descriptionCheck(length: number): CheckResult {
  if (length === 0) {
    return {
      tone: "critical",
      text: "No meta description — set an SEO description or a post description",
    };
  }
  if (length < DESC_MIN) {
    return {
      tone: "caution",
      text: `Description is short (${length}/${DESC_MIN} min) — aim for ${DESC_MIN}–${DESC_MAX}`,
    };
  }
  if (length > DESC_MAX) {
    return {
      tone: "caution",
      text: `Description is long (${length}/${DESC_MAX} max) — it will be truncated`,
    };
  }
  return {
    tone: "positive",
    text: `Description length is good (${length}/${DESC_MAX})`,
  };
}

function buildChecks(args: {
  effectiveTitle: string;
  descLength: number;
  hasImage: boolean;
  seoNoIndex: boolean;
}): CheckResult[] {
  const { effectiveTitle, descLength, hasImage, seoNoIndex } = args;
  return [
    ...titleCheck(effectiveTitle),
    descriptionCheck(descLength),
    hasImage
      ? { tone: "positive", text: "SEO image is set" }
      : {
          tone: "critical",
          text: "No image — set an SEO image or a main image",
        },
    seoNoIndex
      ? {
          tone: "caution",
          text: "Indexing is OFF (seoNoIndex) — excluded from search engines",
        }
      : { tone: "positive", text: "Indexing allowed" },
  ];
}

function resolveIndexStatus(args: {
  indexState: IndexState;
  shouldBeIndexed: boolean;
  reasonText: string;
}): { tone: BadgeTone; label: string; detail: string } {
  const { indexState, shouldBeIndexed, reasonText } = args;
  if (indexState === "loading") {
    return {
      tone: "default",
      label: "Checking…",
      detail: "Asking Algolia whether this post is in the index.",
    };
  }
  if (indexState === "error") {
    return {
      tone: "caution",
      label: "Unknown",
      detail:
        "Couldn't reach Algolia — check the SANITY_STUDIO_ALGOLIA_* env vars.",
    };
  }
  const inIndex = indexState === "present";
  if (inIndex && shouldBeIndexed) {
    return {
      tone: "positive",
      label: "In index",
      detail: "In the search index, as expected.",
    };
  }
  if (!inIndex && shouldBeIndexed) {
    return {
      tone: "critical",
      label: "Missing",
      detail:
        "Published and indexable, but missing from the index. Re-publish it, or run the backfill script.",
    };
  }
  if (inIndex && !shouldBeIndexed) {
    return {
      tone: "critical",
      label: "Should be removed",
      detail: `In the index but shouldn't be (${reasonText}). It will be removed the next time it's published.`,
    };
  }
  return {
    tone: "positive",
    label: "Not in index",
    detail: `Not in the index, as expected (${reasonText}).`,
  };
}

function useIndexState(documentId: string): IndexState {
  const [indexState, setIndexState] = useState<IndexState>("loading");
  useEffect(() => {
    if (!(algolia && indexName)) {
      setIndexState("error");
      return;
    }
    let cancelled = false;
    setIndexState("loading");
    algolia
      .getObject({ indexName, objectID: documentId })
      .then(() => !cancelled && setIndexState("present"))
      .catch((error: { status?: number }) => {
        if (!cancelled) {
          setIndexState(error?.status === 404 ? "absent" : "error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);
  return indexState;
}

function CheckRow({ tone, text }: CheckResult) {
  return (
    <Card padding={3} radius={2} tone={tone as CardTone}>
      <Flex align="center" gap={3}>
        <Text size={2}>{CHECK_GLYPH[tone]}</Text>
        <Text size={1}>{text}</Text>
      </Flex>
    </Card>
  );
}

export const SeoIndexView: UserViewComponent = ({ documentId, document }) => {
  const isPublished = Boolean(document.published);

  // A view is a sibling of the edit form, not inside its FormValueProvider, so
  // useFormValue can't be used here. `displayed` is the live document the pane
  // hands the view and it re-renders on every keystroke, so the preview, counts
  // and checks below still update as the editor types — before anything saves.
  const doc = (document.displayed ?? {}) as BlogDoc;
  const { title, seoTitle, description, seoDescription, image, seoImage } = doc;
  const seoNoIndex = Boolean(doc.seoNoIndex);
  const seoHideFromLists = Boolean(doc.seoHideFromLists);
  const slug = doc.slug?.current;

  const indexState = useIndexState(documentId);

  // Fallbacks mirror the field descriptions in seo-fields.ts: seoTitle falls
  // back to the post title, seoDescription to the post description, seoImage to
  // the main image.
  const effectiveTitle = seoTitle?.trim() || title?.trim() || "";
  const effectiveDescription =
    seoDescription?.trim() || description?.trim() || "";
  const descLength = effectiveDescription.length;
  const hasImage = hasAsset(seoImage) || hasAsset(image);
  // The blog slug is already stored with its `/blog/` prefix, so it's appended
  // to the site origin as-is rather than under another `/blog/`.
  const previewUrl = `${SITE_URL}${slug ?? ""}`;

  const checks = buildChecks({
    effectiveTitle,
    descLength,
    hasImage,
    seoNoIndex,
  });

  // What the document's live values say its index state should be, then
  // compared against Algolia to surface the disagreements.
  const reasons: string[] = [];
  if (!isPublished) {
    reasons.push("not published");
  }
  if (seoNoIndex) {
    reasons.push("seoNoIndex is on");
  }
  if (seoHideFromLists) {
    reasons.push("hidden from lists");
  }
  const index = resolveIndexStatus({
    indexState,
    shouldBeIndexed: reasons.length === 0,
    reasonText: reasons.join(", "),
  });

  return (
    <Container width={1}>
      <Box padding={4}>
        <Stack gap={5}>
          <Stack gap={3}>
            <Heading size={1}>Search preview</Heading>
            <Card padding={4} radius={2} shadow={1}>
              <Stack gap={2}>
                <Text muted size={1}>
                  {previewUrl}
                </Text>
                <Text size={3} style={{ color: "#1a0dab" }} weight="semibold">
                  {truncate(effectiveTitle || "Untitled", TITLE_LIMIT)}
                </Text>
                <Text muted size={1}>
                  {effectiveDescription
                    ? truncate(effectiveDescription, DESC_MAX)
                    : "No description yet."}
                </Text>
              </Stack>
            </Card>
            <Flex gap={2}>
              <Text muted size={0}>
                Title {effectiveTitle.length}/{TITLE_LIMIT}
              </Text>
              <Text muted size={0}>
                · Description {descLength}/{DESC_MAX}
              </Text>
            </Flex>
          </Stack>

          <Stack gap={3}>
            <Heading size={1}>Checks</Heading>
            <Stack gap={2}>
              {checks.map((check) => (
                <CheckRow key={check.text} text={check.text} tone={check.tone} />
              ))}
            </Stack>
          </Stack>

          <Stack gap={3}>
            <Flex align="center" gap={3}>
              <Heading size={1}>Index status</Heading>
              <Badge tone={index.tone}>{index.label}</Badge>
            </Flex>
            <Card
              padding={3}
              radius={2}
              tone={index.tone === "default" ? "transparent" : index.tone}
            >
              <Text size={1}>{index.detail}</Text>
            </Card>
          </Stack>
        </Stack>
      </Box>
    </Container>
  );
};
