import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DOMParser, parseHTML } from 'linkedom';
import deployment from '../wrangler.json' with { type: 'json' };

// Read only build-owned artifacts. These tests never contact a running Partner.
const build = resolve(dirname(fileURLToPath(import.meta.url)), '../build');
const origin = `https://${deployment.routes[0].pattern}`;
const routes = ['/', '/docs/', ...['start', 'full', 'keet', 'memory', 'care'].map((slug) => `/docs/${slug}/`)];
const pages = new Map();
for (const prefix of ['', '/zh']) {
  for (const route of routes) {
    const path = prefix + route;
    const file = resolve(build, `.${path}index.html`);
    pages.set(path, parseHTML(readFileSync(file, 'utf8')).document);
  }
}

for (const [path, document] of pages) {
  test(`${path} is a complete static page in its requested language`, () => {
    assert.equal(document.documentElement.lang, path.startsWith('/zh/') ? 'zh-CN' : 'en');
    assert.equal(document.querySelectorAll('main').length, 1);
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.ok(document.querySelector('h1').textContent.trim());
    assert.ok(document.querySelector('title').textContent.trim());
    assert.ok(document.querySelector('meta[name="description"]').content.trim());
    assert.equal(document.querySelectorAll('script').length, 0, 'published pages must work without a JS runtime');
    assert.ok(document.getElementById('main'));
    assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), origin + path);
  });

  test(`${path} links to the same page in the other language`, () => {
    const switcher = document.querySelector('a[hreflang]');
    const chinese = path.startsWith('/zh/');
    const expected = chinese ? path.slice(3) : `/zh${path}`;
    assert.equal(switcher.getAttribute('href'), expected);
    assert.equal(switcher.getAttribute('lang'), chinese ? 'en' : 'zh-CN');
    assert.ok(pages.has(expected));
    const alternates = [...document.querySelectorAll('link[rel="alternate"][hreflang]')];
    assert.equal(alternates.length, 3);
    for (const alternate of alternates) {
      const targetUrl = new URL(alternate.getAttribute('href'));
      assert.equal(targetUrl.origin, origin);
      const target = pages.get(targetUrl.pathname);
      assert.ok(target);
      const language = alternate.getAttribute('hreflang');
      assert.equal(target.documentElement.lang, language === 'x-default' ? 'en' : language);
    }
  });

  test(`${path} has working local navigation, anchors, and assets`, () => {
    const url = new URL(path, origin);
    for (const link of document.querySelectorAll('a[href], link[href], img[src]')) {
      const attribute = link.localName === 'img' ? 'src' : 'href';
      const target = new URL(link.getAttribute(attribute), url);
      if (target.origin !== origin) continue;
      const targetDocument = pages.get(target.pathname);
      if (targetDocument) {
        if (target.hash) assert.ok(targetDocument.getElementById(decodeURIComponent(target.hash.slice(1))), `${path}: missing ${target.href}`);
        if (link.localName === 'a' && !link.hasAttribute('hreflang')) {
          assert.equal(targetDocument.documentElement.lang, document.documentElement.lang, `${path}: navigation changes language at ${target.pathname}`);
        }
      } else {
        assert.ok(existsSync(resolve(build, `.${target.pathname}`)), `${path}: missing asset ${target.pathname}`);
      }
    }
    for (const image of document.querySelectorAll('img')) {
      assert.ok(image.hasAttribute('alt'));
      assert.ok(Number(image.getAttribute('width')) > 0);
      assert.ok(Number(image.getAttribute('height')) > 0);
    }
    for (const block of document.querySelectorAll('pre')) {
      assert.equal(block.getAttribute('tabindex'), '0', 'code blocks must support keyboard scrolling');
    }
  });
}

test('the root share preview is English without client-side rendering', () => {
  const document = pages.get('/');
  assert.equal(document.querySelector('meta[property="og:locale"]').content, 'en_US');
  for (const field of ['title', 'description']) {
    const preview = document.querySelector(`meta[property="og:${field}"]`).content;
    const visible = field === 'title'
      ? document.querySelector('title').textContent
      : document.querySelector('meta[name="description"]').content;
    assert.equal(preview, visible);
    assert.match(preview, /[A-Za-z]/);
    assert.doesNotMatch(preview, /\p{Script=Han}/u);
  }
  assert.equal(document.querySelector('meta[property="og:url"]').content, `${origin}/`);
});

test('documentation identifies the current guide in both languages', () => {
  for (const [path, document] of pages) {
    if (!/\/docs\/[^/]+\/$/.test(path)) continue;
    const current = document.querySelectorAll('nav a[aria-current="page"]');
    assert.equal(current.length, 1);
    assert.equal(current[0].getAttribute('href'), path);
  }
});

test('unpublished languages and unknown documents are not emitted as fallback pages', () => {
  for (const path of ['fr/index.html', 'zh-CN/index.html', 'en/index.html', 'docs/missing/index.html', 'zh/docs/missing/index.html']) {
    assert.equal(existsSync(resolve(build, path)), false);
  }
});

test('sitemap and robots expose every translated page on the configured domain', () => {
  const sitemap = new DOMParser().parseFromString(readFileSync(resolve(build, 'sitemap.xml'), 'utf8'), 'application/xml');
  const urls = [...sitemap.getElementsByTagName('url')];
  assert.equal(urls.length, pages.size);
  const published = new Set();
  for (const url of urls) {
    const location = new URL(url.getElementsByTagName('loc')[0].textContent);
    assert.equal(location.origin, origin);
    assert.ok(pages.has(location.pathname));
    published.add(location.pathname);
    const alternates = [...url.getElementsByTagName('xhtml:link')];
    assert.equal(alternates.length, 2);
    for (const alternate of alternates) {
      const target = new URL(alternate.getAttribute('href'));
      assert.equal(target.origin, origin);
      assert.equal(pages.get(target.pathname).documentElement.lang, alternate.getAttribute('hreflang'));
    }
  }
  assert.equal(published.size, pages.size);
  assert.ok(readFileSync(resolve(build, 'robots.txt'), 'utf8').includes(`Sitemap: ${origin}/sitemap.xml`));
});

test('Cloudflare serves the static artifact with directory URLs and a real 404', () => {
  assert.equal(deployment.main, undefined);
  assert.equal(deployment.assets.directory, './build');
  assert.equal(deployment.assets.html_handling, 'force-trailing-slash');
  assert.equal(deployment.assets.not_found_handling, '404-page');
  assert.equal(deployment.routes.length, 1);
  assert.equal(deployment.routes[0].custom_domain, true);
  assert.equal(deployment.workers_dev, false);
  const document = parseHTML(readFileSync(resolve(build, '404.html'), 'utf8')).document;
  assert.equal(document.querySelector('meta[name="robots"]').content, 'noindex');
  for (const link of document.querySelectorAll('a[href]')) assert.ok(pages.has(link.getAttribute('href')));
});
