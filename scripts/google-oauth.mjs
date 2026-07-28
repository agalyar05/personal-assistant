#!/usr/bin/env node
/**
 * One-time Google OAuth to get a refresh token for Gmail + Calendar.
 * Usage:
 *   1. Put Desktop OAuth client JSON as credentials.json in project root
 *      (same file you used for the old Python bot), OR set
 *      GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in the environment.
 *   2. node scripts/google-oauth.mjs
 *   3. Copy the printed refresh_token into Vercel / .env.local
 */
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { google } from "googleapis";
import open from "node:child_process";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
];

function loadClient() {
  if (existsSync("credentials.json")) {
    const raw = JSON.parse(readFileSync("credentials.json", "utf8"));
    const installed = raw.installed || raw.web;
    return {
      clientId: installed.client_id,
      clientSecret: installed.client_secret,
    };
  }
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

const { clientId, clientSecret } = loadClient();
if (!clientId || !clientSecret) {
  console.error("Need credentials.json or GOOGLE_CLIENT_ID/SECRET");
  process.exit(1);
}

const redirectUri = "http://127.0.0.1:53682/oauth2callback";
const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/oauth2callback")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const url = new URL(req.url, redirectUri);
  const code = url.searchParams.get("code");
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<h1>OK — you can close this tab.</h1>");
  server.close();
  const { tokens } = await oauth2.getToken(code);
  console.log("\n=== Add these to Vercel / .env.local ===\n");
  console.log(`GOOGLE_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log("\n");
  process.exit(0);
});

server.listen(53682, () => {
  console.log("Open this URL to authorize:\n", authUrl);
  try {
    open.spawn("open", [authUrl]);
  } catch {
    /* ignore */
  }
});
