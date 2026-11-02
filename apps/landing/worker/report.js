/**
 * The report form on /report.html posts here. It sends one plain-text email
 * via Cloudflare's Email Workers binding — no third-party service, no API
 * key, and no address on this side stored anywhere. Cloudflare requires the
 * recipient to already be a verified destination address for the account
 * (see wrangler.jsonc); only adarshaofficial@gmail.com is, so that's where
 * this goes rather than contact@sajilo.fyi.
 */

import { EmailMessage } from "cloudflare:email";
import { createMimeMessage, Mailbox } from "mimetext";

const KINDS = new Set(["Something is broken", "Data looks wrong", "The app crashed", "A feature idea", "Something else"]);
const MAX_LEN = 10000;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // all of them together
const MAX_SCREENSHOTS = 4;

const MAX_BODY_BYTES = 7 * 1024 * 1024; // ~5 MB of screenshots, base64-inflated, plus headroom
// Raster formats only: SVG is an image type that can carry script.
const SCREENSHOT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function handleReport(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!env.REPORT_EMAIL) {
    return new Response("Reporting is not configured", { status: 503 });
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return new Response("Request too large", { status: 413 });
  }

  if (env.REPORT_LIMITER) {
    // Same visitor, same minute: five is plenty for a person filling this in
    // by hand, including a retry or two; anything past that is a script.
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.REPORT_LIMITER.limit({ key: ip });
    if (!success) {
      return new Response("Too many requests, try again in a minute", { status: 429 });
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid request", { status: 400 });
  }

  // A field no visitor should ever fill in. Anything in it is a bot.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return new Response(null, { status: 204 });
  }

  const kind = KINDS.has(body.kind) ? body.kind : "Something else";
  // It becomes the email's subject line, so it stays on one line.
  const summary = clean(body.summary, 200).replace(/[\r\n]+/g, " ");
  const details = clean(body.details, MAX_LEN);
  const version = clean(body.version, 100) || "not given";
  const os = clean(body.os, 100) || "not given";
  const replyEmail = validEmail(clean(body.email, 200));

  if (!summary || !details) {
    return new Response("Missing summary or details", { status: 400 });
  }
  if (!replyEmail) {
    return new Response("A valid email is required", { status: 400 });
  }

  // `screenshot` is the form before it took several; a cached page may still send it.
  const sent = Array.isArray(body.screenshots) ? body.screenshots : body.screenshot ? [body.screenshot] : [];
  const screenshots = sent.map(validScreenshot);
  // Base64 runs ~4/3 the size of the original bytes.
  const bytes = screenshots.reduce((sum, shot) => sum + (shot ? shot.data.length * 0.75 : 0), 0);
  if (sent.length > MAX_SCREENSHOTS || screenshots.some((shot) => !shot) || bytes > MAX_SCREENSHOT_BYTES) {
    return new Response("Up to 4 screenshots, images only, 5 MB in all", { status: 400 });
  }

  const msg = createMimeMessage();
  msg.setSender({ name: "Sajilo report form", addr: "reports@sajilo.fyi" });
  msg.setRecipient("adarshaofficial@gmail.com");
  msg.setSubject(`[Sajilo] ${kind}: ${summary}`);
  msg.setHeader("Reply-To", new Mailbox({ addr: replyEmail }));
  msg.addMessage({
    contentType: "text/plain",
    data: [
      details,
      "",
      "---",
      `App version: ${version}`,
      `OS: ${os}`,
      `Screenshots: ${screenshots.length || "none"}`,
      `Reporter email: ${replyEmail}`,
      `Sent from: ${request.headers.get("Referer") ?? "unknown page"}`,
    ].join("\n"),
  });
  for (const shot of screenshots) {
    msg.addAttachment({
      filename: shot.filename,
      contentType: shot.contentType,
      data: shot.data,
      encoding: "base64",
    });
  }

  const email = new EmailMessage("reports@sajilo.fyi", "adarshaofficial@gmail.com", msg.asRaw());

  try {
    await env.REPORT_EMAIL.send(email);
  } catch (err) {
    console.error("report email failed", err);
    return new Response("Could not send", { status: 502 });
  }

  return new Response(null, { status: 204 });
}

function clean(value, maxLen) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

/** Loose enough for a reply-to header, strict enough to reject junk. */
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}

/** The screenshot, or `null` when it isn't a valid one. */
function validScreenshot(shot) {
  if (!shot || typeof shot !== "object") return null;
  const { filename, contentType, data } = shot;
  if (typeof filename !== "string" || typeof contentType !== "string" || typeof data !== "string") return null;
  if (!SCREENSHOT_TYPES.has(contentType)) return null;
  return { filename: filename.slice(0, 120), contentType, data };
}
