import { authPage, escapeAuthHtml } from "./auth-page.js";

/** Login presentation shared by the server route and browser visual checks. */
export function renderLoginPage({returnTo,googleHref,reviewerEnabled,emailEnabled,emailCsrf}:{
  returnTo:string;googleHref:string;reviewerEnabled:boolean;emailEnabled:boolean;emailCsrf:string;
}) {
  const reviewerForm = reviewerEnabled ? `
    <details>
      <summary>Reviewer access</summary>
      <form method="post" action="/auth/reviewer">
        <input type="hidden" name="return_to" value="${escapeAuthHtml(returnTo)}">
        <label for="review-email">Reviewer email</label>
        <input class="field" id="review-email" type="email" name="email" autocomplete="username" required>
        <label for="review-password">Password</label>
        <input class="field" id="review-password" type="password" name="password" autocomplete="current-password" required>
        <button class="primary" type="submit">Sign in to review account</button>
      </form>
    </details>
  ` : "";

  return authPage("Sign in", `
    <p class="eyebrow">Your computer, your control</p>
    <h1>Welcome to Remote Arc</h1>
    <p class="lead">Sign in or create an account to connect your AI to your own computers. No password needed.</p>
    <a class="google" href="${escapeAuthHtml(googleHref)}">
      <img src="/google-g.svg" alt="" width="22" height="22">
      <span>Continue with Google</span>
    </a>
    ${emailEnabled ? `
      <div class="divider"><span>or continue with email</span></div>
      <form action="/auth/email/request" method="post">
        <input type="hidden" name="email_csrf" value="${emailCsrf}">
        <input type="hidden" name="return_to" value="${escapeAuthHtml(returnTo)}">
        <label for="email">Email address</label>
        <input class="field" id="email" type="email" name="email" maxlength="254" autocomplete="email" placeholder="you@example.com" spellcheck="false" autocapitalize="off" required>
        <button class="primary" type="submit">Continue with email →</button>
      </form>
      <p class="note">We'll email a one-time code. New accounts are created automatically after verification.</p>
    ` : `<p class="note">Email sign-in is temporarily unavailable. Continue securely with Google.</p>`}
    ${reviewerForm}
  `);
}
