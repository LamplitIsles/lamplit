"""Run only inside the Dagger-owned candidate, with disposable state and mock LLM."""

import asyncio
import importlib.util
import json
import os
from pathlib import Path
import resource
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


async def check_embedding():
    import numpy as np
    from hindsight_api.engine.embeddings import create_embeddings_from_env

    assert importlib.util.find_spec("torch") is None, "candidate contains PyTorch"
    assert importlib.util.find_spec("sentence_transformers") is None
    assert os.getuid() == 1000
    provider = create_embeddings_from_env()
    await provider.initialize()
    assert provider.provider_name == "onnx"
    assert provider.dimension == 384
    assert provider.batch_size == 16
    assert provider.max_tokens == 128
    assert provider.query_prefix == provider.passage_prefix == ""
    assert not provider.normalize
    assert not provider._session.get_session_options().enable_cpu_mem_arena
    assert provider._session.get_session_options().intra_op_num_threads == int(
        os.environ["HINDSIGHT_API_EMBEDDINGS_ONNX_INTRA_OP_THREADS"]
    )
    assert provider._session.get_providers() == ["CPUExecutionProvider"]

    # Observe the real ORT calls, including a batch larger than the configured cap.
    session = provider._session
    batch_sizes = []

    class ObservedSession:
        def get_inputs(self):
            return session.get_inputs()

        def run(self, output_names, inputs):
            batch_sizes.append(inputs["input_ids"].shape[0])
            return session.run(output_names, inputs)

    provider._session = ObservedSession()
    sentences = [
        "我喜欢喝乌龙茶。",
        "I like drinking oolong tea.",
        "The database backup completed at midnight.",
    ]
    vectors = np.asarray(provider.encode_documents(sentences * 12))
    assert vectors.shape == (36, 384)
    assert np.isfinite(vectors).all()
    assert max(batch_sizes) <= 16 and sum(batch_sizes) == 36, batch_sizes
    norms = np.linalg.norm(vectors, axis=1)
    assert (norms > 0).all()
    unit = vectors / norms[:, None]
    # Dynamic quantization can vary with batch composition; compare semantics,
    # not bit equality. Repeated inputs must retain their original output order.
    for index in range(len(sentences), len(unit)):
        assert float(unit[index] @ unit[index % len(sentences)]) > 0.98
    assert float(unit[0] @ unit[1]) > float(unit[0] @ unit[2])
    assert "torch" not in sys.modules
    print(json.dumps({
        "dimensions": 384,
        "texts": len(vectors),
        "batch_sizes": batch_sizes,
        "peak_rss_mib": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
        "model_bytes": Path(provider.model_path).stat().st_size,
        "intra_op_threads": session.get_session_options().intra_op_num_threads,
        "torch": False,
    }))


def check_startup():
    # Prevent accidental use outside the test-owned Dagger service graph.
    assert os.environ["HINDSIGHT_API_DATABASE_URL"] == "postgresql://hindsight:lamplit-onnx-test@postgres:5432/hindsight"
    assert os.environ["HINDSIGHT_API_LLM_PROVIDER"] == "mock"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with tempfile.TemporaryDirectory(prefix="lamplit-onnx-check-") as directory:
        log_path = Path(directory) / "startup.log"
        with log_path.open("w") as log:
            process = subprocess.Popen(["/app/start-all.sh"], stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f"Hindsight exited with {process.returncode}")
                try:
                    with opener.open("http://127.0.0.1:8888/health", timeout=3) as response:
                        assert response.status == 200
                    with opener.open("http://127.0.0.1:9999/", timeout=3) as response:
                        assert response.status == 200
                    with opener.open("http://127.0.0.1:8888/v1/default/banks", timeout=3) as response:
                        banks = json.load(response)
                        assert banks["banks"] == [], banks
                    print(json.dumps({"api": "healthy", "ui": "healthy", "banks": 0, "llm": "mock"}))
                    return
                except (urllib.error.URLError, TimeoutError):
                    time.sleep(0.5)
            raise TimeoutError("API and UI did not become ready within 120 seconds")
        except Exception:
            print(log_path.read_text(), file=sys.stderr)
            raise
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=40)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == "__main__":
    if sys.argv[1:] == ["embedding"]:
        asyncio.run(check_embedding())
    elif sys.argv[1:] == ["startup"]:
        check_startup()
    else:
        raise SystemExit("usage: hindsight-image.py embedding|startup")
