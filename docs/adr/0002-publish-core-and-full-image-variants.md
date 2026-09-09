# Publish Core and Full image variants

Lamplit publishes Core and Full variants under one GHCR package: `latest` tracks the newest stable Core image and `full` tracks the newest stable Full image, while versioned tags remain immutable. Core is a lightweight single-container trial without Hindsight or image generation; Full adds their DSH integrations and is deployed through Compose with the separately versioned Hindsight, PostgreSQL, and Codex Bridge services.

Only the Core and Full application images belong to the Lamplit release. The
Compose services are independently produced, prebuilt images; their versions
do not follow the Lamplit application version.

Compose defaults to rolling application `full` and Codex Bridge `latest` tags.
Operators pick up those updates with an explicit pull and container recreation.
`LAMPLIT_IMAGE` and `CODEX_BRIDGE_IMAGE` can select immutable references for a
fixed deployment. Hindsight and PostgreSQL retain their independent digest
pins. The dependency updater records the verified Bridge source tag and digest
even though Compose follows its rolling tag, so a known snapshot remains
available for pinning or rollback.
