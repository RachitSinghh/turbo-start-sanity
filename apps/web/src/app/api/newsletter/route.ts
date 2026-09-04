import { createHash } from "node:crypto";
import { env } from "@workspace/env/server";
import { Logger } from "@workspace/logger";
import { client } from "@workspace/sanity/client";
import { NextResponse } from "next/server";

const logger = new Logger("Newsletter");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const writeClient = client.withConfig({ token: env.SANITY_API_WRITE_TOKEN });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 }
    );
  }

  const rawEmail = (body as { email?: unknown })?.email;
  if (typeof rawEmail !== "string" || !EMAIL_PATTERN.test(rawEmail)) {
    return NextResponse.json(
      { error: "A valid email is required" },
      { status: 400 }
    );
  }
  const email = rawEmail.trim().toLowerCase();

  // Deterministic ID from the normalized email, so a repeat signup resolves
  // to the same document instead of racing a query-then-create check.
  const id = `subscriber.${createHash("sha256").update(email).digest("hex")}`;

  try {
    await writeClient.createIfNotExists({
      _id: id,
      _type: "subscriber",
      email,
      subscribedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to write subscriber", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
