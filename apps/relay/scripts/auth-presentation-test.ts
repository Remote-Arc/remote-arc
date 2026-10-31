// Tests for authentication UI pages, HTML escaping, email CSRF tokens,
// and transactional email template formatting.
import assert from "node:assert/strict";
import { authPage, escapeAuthHtml } from "../src/auth/auth-page.js";
import { renderLoginPage } from "../src/auth/login-page.js";
import { emailFormToken, validEmailFormToken } from "../src/auth/email-form-csrf.js";
import { renderOtpEmail } from "../src/platform/email-template.js";

// 1. authPage & escapeAuthHtml
assert.equal(
  escapeAuthHtml(`<script>alert("xss") & 'foo'</script>`),
  "&lt;script&gt;alert(&quot;xss&quot;) &amp; &#39;foo&#39;&lt;/script&gt;",
);

const pageResponse = authPage("Verify Code", "<div>Enter 6-digit code</div>");
assert.equal(pageResponse.status, 200);
assert.equal(pageResponse.headers.get("content-type"), "text/html; charset=utf-8");
const pageHtml = await pageResponse.text();
assert.match(pageHtml, /<!doctype html>/i);
assert.match(pageHtml, /<title>Verify Code · Remote Arc<\/title>/);
assert.match(pageHtml, /<div>Enter 6-digit code<\/div>/);

// 2. renderLoginPage options and XSS immunity
const baseParams = {
  returnTo: "/dashboard?tab=devices&active=1",
  googleHref: "https://accounts.google.com/o/oauth2/v2/auth?client_id=123",
  emailCsrf: "a".repeat(64),
  emailEnabled: true,
  reviewerEnabled: true,
};

let res = renderLoginPage(baseParams);
let html = await res.text();
assert.match(html, /<form action="\/auth\/email\/request" method="post">/);
assert.match(html, new RegExp(`value="${"a".repeat(64)}"`));
assert.match(html, /Reviewer access/);
assert.match(html, /Sign in to review account/);

// Disabled reviewer form
res = renderLoginPage({ ...baseParams, reviewerEnabled: false });
html = await res.text();
assert.doesNotMatch(html, /Reviewer access/);

// Disabled email form
res = renderLoginPage({ ...baseParams, emailEnabled: false });
html = await res.text();
assert.match(html, /Email sign-in is temporarily unavailable/);
assert.doesNotMatch(html, /form action="\/auth\/email\/request"/);

// XSS in returnTo and googleHref is escaped
const xssParams = {
  ...baseParams,
  returnTo: `"><script>alert(1)</script>`,
  googleHref: `https://example.com/"><script>alert(2)</script>`,
};
res = renderLoginPage(xssParams);
html = await res.text();
assert.doesNotMatch(html, /<script>alert/);
assert.match(html, /&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

// 3. emailFormToken & validEmailFormToken
// First request: issues a fresh random token with host-only cookie
const req1 = new Request("https://mcp.remotearc.app/auth/login");
const token1 = emailFormToken(req1);
assert.match(token1.token, /^[a-f0-9]{64}$/);
assert.ok(token1.setCookie);
assert.match(token1.setCookie, /__Host-ra_email_form=[a-f0-9]{64};/);
assert.match(token1.setCookie, /Secure; HttpOnly; SameSite=Lax/);

// Subsequent request with valid cookie: reuses token and omits Set-Cookie
const req2 = new Request("https://mcp.remotearc.app/auth/login", {
  headers: { cookie: `other=1; __Host-ra_email_form=${token1.token}; session=xyz` },
});
const token2 = emailFormToken(req2);
assert.equal(token2.token, token1.token);
assert.equal(token2.setCookie, null);

// Subsequent request with invalid/tampered cookie: generates fresh token
const reqTampered = new Request("https://mcp.remotearc.app/auth/login", {
  headers: { cookie: `__Host-ra_email_form=not-valid-hex` },
});
const tokenFresh = emailFormToken(reqTampered);
assert.notEqual(tokenFresh.token, "not-valid-hex");
assert.match(tokenFresh.token, /^[a-f0-9]{64}$/);
assert.ok(tokenFresh.setCookie);

// CSRF validation
const postReq = new Request("https://mcp.remotearc.app/auth/email/request", {
  headers: { cookie: `__Host-ra_email_form=${token1.token}` },
});

// Valid match
const validBody = new FormData();
validBody.set("email_csrf", token1.token);
assert.equal(validEmailFormToken(postReq, validBody), true);

// Mismatched token
const badBody = new FormData();
badBody.set("email_csrf", "b".repeat(64));
assert.equal(validEmailFormToken(postReq, badBody), false);

// Missing token in body
const emptyBody = new FormData();
assert.equal(validEmailFormToken(postReq, emptyBody), false);

// Missing cookie in request
const noCookieReq = new Request("https://mcp.remotearc.app/auth/email/request");
assert.equal(validEmailFormToken(noCookieReq, validBody), false);

// Non-hex token in body
const nonHexBody = new FormData();
nonHexBody.set("email_csrf", token1.token.slice(0, 63) + "z");
assert.equal(validEmailFormToken(postReq, nonHexBody), false);

// 4. renderOtpEmail
assert.throws(() => renderOtpEmail(""), /OTP email requires a six-digit numeric code/);
assert.throws(() => renderOtpEmail("12345"), /OTP email requires a six-digit numeric code/);
assert.throws(() => renderOtpEmail("1234567"), /OTP email requires a six-digit numeric code/);
assert.throws(() => renderOtpEmail("12345a"), /OTP email requires a six-digit numeric code/);

const email = renderOtpEmail("839201");
assert.equal(email.subject, "Your Remote Arc verification code");
assert.match(email.text, /839201/);
assert.match(email.text, /This code expires in 10 minutes/);
assert.match(email.html, /839201/);
assert.match(email.html, /Your one-time Remote Arc sign-in code expires in 10 minutes/);
assert.match(email.html, /<!doctype html>/i);

console.log("PASS: auth pages, XSS immunity, double-submit CSRF cookie protection and OTP email template formatting");
