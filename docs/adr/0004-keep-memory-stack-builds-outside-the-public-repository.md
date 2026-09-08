# Build Hindsight independently from application releases

Lamplit owns the ONNX INT8 Hindsight Dockerfile in `docker/hindsight/`, with
independently callable Dagger build and verification targets. Bringing this
recipe into the repository makes the multilingual model, runtime dependencies,
and memory fixes reviewable together with the distribution that uses them.

Core and Full application releases remain separate. Their normal checks do
not build Hindsight. Full Compose uses the published ONNX INT8 image by
default, pinned by digest with explicit CPU and ORT thread budgets.
PostgreSQL and Codex Bridge remain independently supplied artifacts.

Repository defaults and deployment timing are separate decisions. The ONNX
image replaces FP32 in the normal configuration; operators switch existing
containers during their planned deployment window while preserving database
volumes and existing vectors.

This revises the original decision to keep every memory-stack build recipe
outside the public repository, following the owner's request on 2026-09-08.
The separate build graph retains the original resource boundary on small WSL
runners. See [the ONNX build contract](../hindsight-onnx.md).
