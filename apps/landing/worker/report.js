/**
 * The report form on /report.html posts here. It sends one plain-text email
 * to contact@sajilo.fyi via Cloudflare's Email Workers binding — no
 * third-party service, no API key, and no address on this side stored
 * anywhere. Cloudflare requires the destination to already be a verified
 * address for the account (see wrangler.jsonc), which is the only setup this
 * needs beyond the binding itself.
 */

import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";

const KINDS = new Set(["Something is broken", "Data looks wrong", "The app crashed", "A feature idea", "Something else"]);
const MAX_LEN = 4000;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

const MAX_BODY_BYTES = 7 * 1024 * 1024; // ~5 MB screenshot, base64-inflated, plus headroom

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
  const summary = clean(body.summary, 200);
  const details = clean(body.details, MAX_LEN);
  const version = clean(body.version, 100) || "not given";
  const os = clean(body.os, 100) || "not given";
  const replyEmail = validEmail(clean(body.email, 200));

  if (!summary || !details) {
    return new Response("Missing summary or details", { status: 400 });
  }

  const screenshot = validScreenshot(body.screenshot);
  if (body.screenshot && !screenshot) {
    return new Response("Screenshot must be an image under 5 MB", { status: 400 });
  }

  const msg = createMimeMessage();
  msg.setSender({ name: "Sajilo report form", addr: "reports@sajilo.fyi" });
  msg.setRecipient("contact@sajilo.fyi");
  msg.setSubject(`[Sajilo] ${kind}: ${summary}`);
  if (replyEmail) msg.setHeader("Reply-To", { addr: replyEmail });
  msg.addMessage({
    contentType: "text/plain",
    data: [
      details,
      "",
      "---",
      `App version: ${version}`,
      `OS: ${os}`,
      `Reporter email: ${replyEmail || "not given"}`,
      `Sent from: ${request.headers.get("Referer") ?? "unknown page"}`,
    ].join("\n"),
  });
  if (screenshot) {
    msg.addAttachment({
      filename: screenshot.filename,
      contentType: screenshot.contentType,
      data: screenshot.data,
      encoding: "base64",
    });
  }

  const email = new EmailMessage("reports@sajilo.fyi", "contact@sajilo.fyi", msg.asRaw());

  try {
    await env.REPORT_EMAIL.send(email);
  } catch (err) {
    // Most likely cause: contact@sajilo.fyi is not yet a verified
    // destination address in the Cloudflare account.
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

/** Optional. `null` for "none attached"; `false` for "attached but invalid". */
function validScreenshot(shot) {
  if (!shot || typeof shot !== "object") return null;
  const { filename, contentType, data } = shot;
  if (typeof filename !== "string" || typeof contentType !== "string" || typeof data !== "string") return false;
  if (!contentType.startsWith("image/")) return false;
  // Base64 runs ~4/3 the size of the original bytes.
  if (data.length * 0.75 > MAX_SCREENSHOT_BYTES) return false;
  return { filename: filename.slice(0, 120), contentType, data };
}
