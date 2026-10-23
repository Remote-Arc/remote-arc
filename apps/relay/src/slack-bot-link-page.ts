import { authPage, escapeAuthHtml } from './auth-page.js';

export function slackLinkConfirmationPage(action:string,email:string,slackUserId:string,teamId:string):Response {
 const response=authPage('Connect Slack',`<h1>Connect your Slack identity</h1><p class="lead">Use <span class="email-highlight">${escapeAuthHtml(email)}</span> for Slack user ${escapeAuthHtml(slackUserId)} in ${escapeAuthHtml(teamId)}. Your pending Slack request will continue under this account’s plan, credits and permissions.</p><form method="post" action="${escapeAuthHtml(action)}"><button class="primary" type="submit">Connect &amp; continue my request</button></form>`);
 // Native form POSTs with no-referrer carry Origin: null. Keep the browser's
 // same-origin Origin for CSRF validation, without sending the link off-site.
 response.headers.set('referrer-policy','same-origin');
 return response;
}
