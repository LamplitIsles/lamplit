# Publish a static bilingual Partner website

Lamplit's public website addresses people in human–AI romantic relationships,
leading with everyday companionship and shared memory while connecting visitors
to the available self-hosting path. English owns the unprefixed public URLs and their social-sharing metadata;
Chinese uses `/zh/`, with the same guide paths in both languages. This explicit
URL contract lets visitors share a chosen language and switch the current guide
without browser-language redirects. SvelteKit prerenders both languages from
shared templates into a static artifact: the public site uses Cloudflare Static Assets at
`lamplit.guion.io` without a custom Worker handler or hosted application runtime, and remains separate from the Partner's private
runtime and the future hosted control plane.

The feature visuals are original illustrations inspired by Keet and Hindsight,
with localized sample conversations and hoverable memory vignettes. Examples
focus on discussing interests and everyday experiences, without implying
physical presence or sensory capabilities. Visible captions describe the scenes;
accessible descriptions identify the illustrations.
