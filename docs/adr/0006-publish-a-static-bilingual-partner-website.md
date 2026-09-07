# Publish a static bilingual Partner website

Lamplit's public website addresses people in human–AI romantic relationships,
leading with everyday companionship and shared memory while connecting visitors
to the available self-hosting path. Chinese owns the unprefixed public URLs;
English uses `/en/`, with the same guide paths in both languages. This explicit
URL contract lets visitors share a chosen language and switch the current guide
without browser-language redirects. SvelteKit prerenders both languages from
shared templates into a static artifact: the public site uses Cloudflare Static Assets at
`lamplit.guion.io` without a custom Worker handler or hosted application runtime, and remains separate from the Partner's private
runtime and the future hosted control plane.
