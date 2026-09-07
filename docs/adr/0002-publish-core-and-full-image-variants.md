# Publish Core and Full image variants

Lamplit publishes Core and Full variants under one GHCR package: `latest` tracks the newest stable Core image and `full` tracks the newest stable Full image, while versioned tags remain immutable. Core is a lightweight single-container trial without Hindsight or image generation; Full adds their DSH integrations and is deployed through Compose with the separately versioned Hindsight, PostgreSQL, and Codex Bridge services.

Only the Core and Full application images belong to the Lamplit release. The
Compose services are independently produced, prebuilt images pinned by digest;
their versions do not follow the Lamplit application version.
