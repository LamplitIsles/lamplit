# Lamplit Hindsight ONNX image

Lamplit image assembly is covered by Elastic License 2.0. The upstream
Hindsight API and control plane remain MIT licensed. The base is the
immutable Linux amd64 Hindsight 0.9.2 slim image identified in the Dockerfile.

The ONNX batching and CPU arena changes are a backport of the provider portion
of Hindsight commit `7051c6e3b072eca8a05e1fbdbc84487ada39f630` (MIT):
https://github.com/vectorize-io/hindsight/commit/7051c6e3b

The separate `onnx-threads.patch` is a Lamplit-local change that makes ORT
intra-op threads explicit and configurable for container CPU budgets. It
is applied after the upstream memory backport.

The bundled `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
model and tokenizer are Apache-2.0 licensed, pinned to revision
`e8f8c211226b894fcb81acc59f3b34ba3efd5f42`. The model card and license texts
are installed beside this notice. The selected ONNX artifact is
`onnx/model_quint8_avx2.onnx`; the image requires an amd64 CPU with AVX2.

ONNX Runtime retains its MIT license. Transformers and safetensors retain
their Apache-2.0 licenses and package notices. `python-packages.json` records
the installed Python distributions; it supplements, rather than replaces,
the upstream base image's dependency inventory. The Core/Full application
SBOM does not describe this independently built service image.
