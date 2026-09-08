# Hindsight ONNX INT8 image

`docker/hindsight/Dockerfile` builds the multilingual memory service for
Linux amd64 CPUs with AVX2. Dagger owns its build and verification interface:

```sh
dagger call -m dagger hindsight-check --source .
```

This runs actual offline embedding inference and verifies bounded batches,
384-dimensional multilingual output, explicit ORT threads, and absence of
PyTorch. It then starts the API and control plane against disposable
PostgreSQL and the built-in mock LLM. It uses no operator volumes,
credentials, or live banks. The embedding-process peak RSS is not a capacity
result for API + PostgreSQL or a busy multi-user deployment.

Full Compose pulls the published image; no local build is needed for deployment.
To export a development image:

```sh
mkdir -p .scratch
dagger call -m dagger hindsight --source . export --path .scratch/hindsight-onnx.tar
docker load -i .scratch/hindsight-onnx.tar
# Tag the image ID returned by docker load:
docker tag <loaded-image-id> localhost/lamplit-hindsight:onnx-int8
```

## Independent publication

Version **0.1.2** was published on 2026-09-08 from source commit
`2f996ffdfef21dd1d3bebf761c48f75586c31e54`:

```text
ghcr.io/lamplitisles/lamplit-hindsight:0.1.2@sha256:c95b8c604824c778c3ec63105c8382f23e3561c7a56b5334a60777efd8b809dd
```

The main `compose.yaml` pins this release and replaces the old FP32 default.
Publishing an image or updating a checkout does not switch running containers;
operators apply the change during their planned deployment window.

`hindsight-publish` verifies the exact release image with offline inference
and disposable API/UI startup before attaching registry credentials and
publishing one versioned tag. It does not publish PostgreSQL, Core/Full, or a
rolling tag. Supply a new `vX.Y.Z` image version and the full commit SHA of a
clean checkout; do not create a repository `vX.Y.Z` tag for this operation,
because those tags trigger application releases.

With `GHCR_USERNAME` and `GHCR_TOKEN` available in the environment:

```sh
dagger call -m dagger hindsight-publish --source . \
  --release-tag vX.Y.Z --revision "$(git rev-parse HEAD)" \
  --registry-username "$GHCR_USERNAME" --registry-password env:GHCR_TOKEN
```

Check that the selected version is unused before publishing. Dagger returns
the registry digest; verify it through GHCR, then update `compose.yaml`,
`config/memory-images.json`, and the service notice inventory together.
Publication itself does not deploy.

## Recommended configuration for the current WSL host

The measured host is an Intel i5-1240P with 16 logical CPUs exposed to WSL
and about 15 GiB of WSL memory, shared with other services. The current
recommendation is **4 CPU quota / 4 ORT intra-op threads / batch 16**. This
balances the measured response times and batch throughput while keeping a
CPU budget for the rest of the machine. It is a recommendation for the tested
workloads, not a universal optimum or a full-stack concurrency result.

`compose.yaml` supplies the default deployment settings:

```yaml
services:
  hindsight:
    cpus: 4
    environment:
      HINDSIGHT_API_EMBEDDINGS_PROVIDER: onnx
      HINDSIGHT_API_EMBEDDINGS_ONNX_INTRA_OP_THREADS: "4"
```

The image defaults to two explicit ORT threads when run directly; Compose
configures four. The new `HINDSIGHT_API_EMBEDDINGS_ONNX_INTRA_OP_THREADS` setting
accepts positive integers and configures the real ORT session. A smaller
2 CPU / 2 thread deployment is a measured alternative when CPU availability
matters more than latency. A CPU quota limits CPU time; it does not reserve
physical cores or constrain visible CPU affinity like a CPU set.

The image owns these settings:

- Batch maximum 16 and 128-token truncation.
- CPU memory arena disabled, to limit retained activation memory.
- ORT's default sequential graph execution and `ORT_ENABLE_ALL` graph
  optimization. Sequential graph execution still allows parallel work
  inside an operator through the intra-op thread pool.
- Default intra-op spinning behavior. Disabling it reduced CPU consumption
  after inference but increased short-query latency in the measured cases.

`OMP_NUM_THREADS` alone does not configure this ORT thread pool. The original
candidate left ORT threads on automatic selection; explicitly setting the
pool removed the slowdown under a tight CPU quota. No model conversion,
re-quantization, or dependency upgrade was needed.

## Reproducible inputs and runtime

- Base: digest-pinned upstream Hindsight 0.9.2 **slim**, including API and UI.
- Memory patch: the ONNX provider portion of upstream MIT commit
  `7051c6e3b072eca8a05e1fbdbc84487ada39f630`, applied with zero patch fuzz.
  It bounds forward passes and disables the CPU memory arena by default.
- Thread patch: the separate Lamplit-local `onnx-threads.patch`, applied
  after the memory patch, exposes explicit intra-op thread configuration.
  This remains a backport onto 0.9.2, not a whole-service upgrade.
- Model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` at
  `e8f8c211226b894fcb81acc59f3b34ba3efd5f42`, using
  `onnx/model_quint8_avx2.onnx`. Every downloaded file has a SHA-256 check.
- Dependencies: the base supplies ORT 1.20.1 and supporting packages; the
  two additions are version/hash-pinned in `docker/hindsight/requirements.txt`.
  `uv pip check` verifies them against the base. No PyTorch or
  SentenceTransformers package is installed.
- Encoding: 384 dimensions, masked mean pooling, no query/passage prefix,
  and no L2 normalization, matching the old local MiniLM pipeline. Models
  load from local files with Hub access disabled. Reranking remains RRF.
- Provenance and notices: `/usr/share/doc/lamplit-hindsight/` contains the
  model card, assembly and upstream licenses, and installed Python inventory.
  This service inventory is separate from the Core/Full npm SBOM.

The image inherits upstream non-root API/UI startup and exposes the same
ports. Model files are stored once; download caches and patch build tools
are absent from the final stage. The base's embedded-database capability is
inherited, but Lamplit and its test graph use external PostgreSQL.

## Measurements on 2026-09-08

The thread sweep used the same model, disabled arena, batch 16, and five
warm measurements per case. Times below are medians in milliseconds.

| CPU quota | ORT threads | 24 separate queries | 24 short documents | 64 long documents |
| --- | ---: | ---: | ---: | ---: |
| 2 | 1 | 119 | 75 | 2254 |
| 2 | 2 | 85 | 48 | 1306 |
| 2 | 4 | 201 | 106 | 2378 |
| 2 | 8 | 1042 | 501 | 9812 |
| 4 | 4 | 86 | 40 | 984 |
| Unrestricted | 4 | 77 | 37 | 1038 |
| Unrestricted | 8 | 91 | 47 | 1060 |

Four threads improved on two when given enough CPU budget; eight provided
no further benefit. With a two-CPU quota, excess threads made inference much
slower. Disabling spinning at 4 CPU / 4 threads increased 24-query time from
86 ms to 183 ms. Batch 8 did not consistently improve on batch 16. Additional
batch-32 and three-thread trials coincided with increased host load, so they
do not establish a reliable ranking; retain the existing batch cap of 16.

### Final comparison with the rebuilt image

The final comparison used the actual image configuration, without temporary
session overrides. Both images had a 4 CPU quota, a test-only 3 GiB memory
limit, `OMP_NUM_THREADS=4`, no network, a read-only root, and disposable
`/tmp`. The ORT environment setting was also explicitly 4. The probes checked
that both actual runtimes reported four intra-op threads.

Order was FP32, INT8, INT8, FP32. Each process warmed each workload and then
measured it five times; the table aggregates ten measurements per workload
and image. The host continued running its other services.

| Workload | FP32 median | INT8 median | Speedup |
| --- | ---: | ---: | ---: |
| 24 separate queries | 336 ms | 81 ms | 4.16x |
| 24 short documents | 87 ms | 39 ms | 2.24x |
| 64 long documents, truncated to 128 tokens | 1825 ms | 973 ms | 1.88x |
| Maximum process peak RSS across the two runs | 1229 MiB | 945 MiB | 23% reduction |
| Local uncompressed image size | 5.45 GiB | 2.60 GiB | 52% reduction |

The 24-query measurements ranged from 301–370 ms for FP32 and 71–102 ms
for INT8. Long-document measurements ranged from 1769–2017 ms and
946–1154 ms, respectively. These are embedding measurements, not end-to-end
API latency, production recall throughput, or a reason to reduce full-stack
memory limits. The 3 GiB test limit is not added to the deployment configuration.

Local image IDs for this measurement:

- FP32: `e9874f11c75b455e877f161e861c44c7a115bf9c80e6b0d51a79d0d00618ca62`
- INT8: `42d4b56dbdd3da5690cabd8a038ced2b72cb30aeb9110ff8a2349c2d89edabd1`

### Vector compatibility after thread configuration

`tests/hindsight-compatibility.py` uses 24 synthetic Chinese/English facts
and 24 questions in the other language, with exact cosine ranking. Documents
are encoded together; queries are lists of one text. Mixed cases replace
alternate document vectors with INT8 vectors, testing both parity choices.
These short, distinct facts are a small compatibility probe. It does not
exercise database indexes, keyword retrieval, RRF, or LLM extraction.

| Document / query encoding | Correct top 1 | Correct top 3 | Mean top-5 set overlap with FP32 |
| --- | ---: | ---: | ---: |
| FP32 / FP32 | 24/24 | 24/24 | 100% |
| FP32 / INT8 | 24/24 | 24/24 | 91.7% |
| Mixed / INT8, even documents replaced | 24/24 | 24/24 | 94.2% |
| Mixed / INT8, odd documents replaced | 24/24 | 24/24 | 92.5% |
| INT8 / INT8 | 23/24 | 24/24 | 91.7% |

Mean matching-vector cosine was 0.9952 for documents and 0.9965 for queries.
With all-INT8 vectors, “数据库每天几点备份？” ranked the refund-policy distractor
above the backup fact, with cosine 0.4281 versus 0.4219. Thread configuration
did not change these results. Keep old vectors initially and validate on
representative data before claiming production recall equivalence. Do not
re-embed all banks just because the embedding provider changed.

## Reproduce the final comparison

Build/export the candidate through Dagger first. The commands below run only
isolated containers and write generated results under `.scratch/`:

```sh
mkdir -p .scratch/onnx-verification
run_probe() {
  mode=$1 action=$2 round=$3
  if [ "$mode" = fp32 ]; then
    candidate=localhost/kosmos/hindsight:0.1.1
    provider=local
  else
    candidate=localhost/lamplit-hindsight:onnx-int8
    provider=onnx
  fi
  docker run --rm --network none --read-only \
    --tmpfs /tmp:rw,size=256m --cpus 4 --memory 3g \
    -e OMP_NUM_THREADS=4 \
    -e HINDSIGHT_API_EMBEDDINGS_PROVIDER="$provider" \
    -e HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL=/opt/hindsight-models/paraphrase-multilingual-MiniLM-L12-v2 \
    -e HINDSIGHT_API_EMBEDDINGS_LOCAL_FORCE_CPU=1 \
    -e HINDSIGHT_API_EMBEDDINGS_ONNX_INTRA_OP_THREADS=4 \
    -v "$PWD/tests/hindsight-compatibility.py:/test.py:ro" \
    --entrypoint python "$candidate" /test.py "$action" \
    > ".scratch/onnx-verification/tuned-$mode-$action-$round.json" \
    2> ".scratch/onnx-verification/tuned-$mode-$action-$round.log"
}
run_probe fp32 profile 1
run_probe int8 profile 1
run_probe int8 profile 2
run_probe fp32 profile 2
run_probe fp32 encode 1
run_probe int8 encode 1
python3 tests/hindsight-compatibility.py compare \
  .scratch/onnx-verification/tuned-fp32-encode-1.json \
  .scratch/onnx-verification/tuned-int8-encode-1.json
```

## Deployment and existing installations

The main Compose configuration uses the published 0.1.2 image, the ONNX
provider, four intra-op threads, and a four-CPU quota. No extra Compose file
is required. The existing database, volumes, API/UI ports, RRF, LLM settings,
and container protections are preserved. Rendering is read-only:

```sh
docker compose config --quiet
```

Use `HINDSIGHT_IMAGE` to select another verified image. Review any existing
image override when upgrading, since it takes precedence over the new default.
After backing up the database and choosing an upgrade window, an operator
can pull and recreate only Hindsight with the same deployment environment:

```sh
docker compose pull hindsight
docker compose up -d --no-deps hindsight
```

These are deployment instructions, not actions performed by the build,
publication, or verification commands. The repository default has changed;
the running deployment is switched separately.

Keep the existing PostgreSQL volume and document vectors initially. Changing
the provider does not require an LLM extraction or consolidation pass. Before
changing memory limits, measure cold, warm, and concurrent API + PostgreSQL
workloads together. Quantizing the model does not shrink stored vectors or
indexes. Representative retrieval measurements should decide whether a later
re-embedding is useful.
