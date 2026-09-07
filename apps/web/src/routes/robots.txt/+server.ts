import { siteOrigin } from '$lib/site-origin';

export const prerender = true;

export function GET() {
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
