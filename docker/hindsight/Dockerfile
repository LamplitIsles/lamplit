# syntax=docker/dockerfile:1.7
# Linux amd64 / AVX2. Retain the upstream API + UI and install only the
# tokenizer dependencies missing from its torch-free slim environment.
ARG HINDSIGHT_BASE=ghcr.io/vectorize-io/hindsight:0.9.2-slim@sha256:97ab9978ddf1394fc6a163f4c779fa9c7e5123770c881844bd2e0e9a60b0d18a

FROM ${HINDSIGHT_BASE} AS patched-api
USER root
RUN apt-get update && apt-get install -y --no-install-recommends patch \
    && rm -rf /var/lib/apt/lists/*
RUN --mount=type=bind,source=docker/hindsight/onnx-memory.patch,target=/tmp/onnx-memory.patch,ro \
    cd /app/api && patch --batch --fuzz=0 -p1 < /tmp/onnx-memory.patch
RUN --mount=type=bind,source=docker/hindsight/onnx-threads.patch,target=/tmp/onnx-threads.patch,ro \
    cd /app/api && patch --batch --fuzz=0 -p1 < /tmp/onnx-threads.patch

FROM ${HINDSIGHT_BASE}
ARG LAMPLIT_REVISION=dev
ARG LAMPLIT_VERSION=dev
USER root
RUN --mount=type=bind,source=docker/hindsight/requirements.txt,target=/tmp/onnx-requirements.txt,ro \
    uv pip install --python /app/api/.venv/bin/python --no-cache --no-deps \
      --require-hashes --only-binary :all: -r /tmp/onnx-requirements.txt \
    && uv pip check --python /app/api/.venv/bin/python \
    && /app/api/.venv/bin/python -c "import importlib.util; assert importlib.util.find_spec('torch') is None; assert importlib.util.find_spec('sentence_transformers') is None"

COPY --from=patched-api --chown=1000:1000 /app/api/hindsight_api/config.py /app/api/hindsight_api/config.py
COPY --from=patched-api --chown=1000:1000 /app/api/hindsight_api/engine/embeddings.py /app/api/hindsight_api/engine/embeddings.py

# Dagger supplies checksum-verified files from model.json. No Hub cache or
# float32 model is copied into the image. The fast tokenizer uses tokenizer.json.
ARG EMBEDDING_MODEL
ARG EMBEDDING_REVISION
COPY --chown=1000:1000 .build/hindsight/model /opt/hindsight-models/minilm-int8/
COPY .build/hindsight/model/README.md /usr/share/doc/lamplit-hindsight/model-card.md

COPY LICENSE /usr/share/doc/lamplit-hindsight/LICENSE
COPY licenses/hindsight-0.9.2-MIT.txt /usr/share/doc/lamplit-hindsight/licenses/hindsight-MIT.txt
COPY licenses/kepos-hindsight-0.2.0-Apache-2.0.txt /usr/share/doc/lamplit-hindsight/licenses/Apache-2.0.txt
COPY docker/hindsight/NOTICE.md /usr/share/doc/lamplit-hindsight/NOTICE.md
RUN chmod -R a+rX /opt/hindsight-models/minilm-int8 /usr/share/doc/lamplit-hindsight \
    && uv pip list --python /app/api/.venv/bin/python --format json > /usr/share/doc/lamplit-hindsight/python-packages.json

ENV HINDSIGHT_API_EMBEDDINGS_PROVIDER=onnx \
    HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_ID=${EMBEDDING_MODEL} \
    HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_PATH=/opt/hindsight-models/minilm-int8/model.onnx \
    HINDSIGHT_API_EMBEDDINGS_ONNX_TOKENIZER_NAME_OR_PATH=/opt/hindsight-models/minilm-int8 \
    HINDSIGHT_API_EMBEDDINGS_ONNX_DIMENSIONS=384 \
    HINDSIGHT_API_EMBEDDINGS_ONNX_MAX_TOKENS=128 \
    HINDSIGHT_API_EMBEDDINGS_ONNX_POOLING=mean \
    HINDSIGHT_API_EMBEDDINGS_ONNX_NORMALIZE=false \
    HINDSIGHT_API_EMBEDDINGS_ONNX_QUERY_PREFIX="" \
    HINDSIGHT_API_EMBEDDINGS_ONNX_PASSAGE_PREFIX="" \
    HINDSIGHT_API_EMBEDDINGS_ONNX_BATCH_SIZE=16 \
    HINDSIGHT_API_EMBEDDINGS_ONNX_CPU_MEM_ARENA=false \
    HINDSIGHT_API_EMBEDDINGS_ONNX_INTRA_OP_THREADS=2 \
    HINDSIGHT_API_RERANKER_PROVIDER=rrf \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    TOKENIZERS_PARALLELISM=false \
    PYTHONDONTWRITEBYTECODE=1

LABEL org.opencontainers.image.title="lamplit-hindsight-onnx" \
      org.opencontainers.image.version="${LAMPLIT_VERSION}" \
      org.opencontainers.image.revision="${LAMPLIT_REVISION}" \
      org.opencontainers.image.source="https://github.com/LamplitIsles/lamplit" \
      org.opencontainers.image.licenses="Elastic-2.0 AND MIT AND Apache-2.0" \
      org.opencontainers.image.embedding-model="${EMBEDDING_MODEL}" \
      org.opencontainers.image.embedding-model-revision="${EMBEDDING_REVISION}" \
      io.lamplit.hindsight.onnx-fix="7051c6e3b072eca8a05e1fbdbc84487ada39f630"

USER 1000:1000
