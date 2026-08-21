// One place that knows the donation address.
//
// Every support link on the site points here instead of at PayPal directly,
// including the ones baked into imported episode HTML (rewritten at render
// time by rewriteSupportLinks). Changing where donations go is then a matter
// of editing PAYPAL_URL and restarting — no code change, no rebuild.
//
// This is a route handler rather than an entry in redirects.ts because that
// config is evaluated at build time: the destination would be baked into the
// image, and switching it would mean rebuilding and redeploying.

export const dynamic = 'force-dynamic'

const FALLBACK = 'https://www.paypal.com/ncp/payment/7KCR9XBSCQVMG'

export function GET() {
  const target = process.env.PAYPAL_URL?.trim() || FALLBACK
  // 302, not 301: a permanent redirect gets cached by browsers and would keep
  // sending people to the old address long after it changed.
  return Response.redirect(target, 302)
}
