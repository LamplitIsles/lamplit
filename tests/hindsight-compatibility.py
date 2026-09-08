"""Isolated synthetic comparison; encode inside each image, compare JSON on host.

Usage: hindsight-compatibility.py encode | profile | compare FP32.json INT8.json
This measures embedding inference only and never connects to a database.
"""

import asyncio
import json
import math
import resource
import statistics
import sys
import time

pairs = [
    ("美玲喜欢喝无糖乌龙茶。", "What tea does Meiling prefer?"),
    ("明天下午三点和设计师开会。", "When is the meeting with the designer?"),
    ("The database backup runs every night at two.", "数据库每天几点备份？"),
    ("Alex is allergic to peanuts.", "Alex不能吃什么食物？"),
    (
        "台北办公室的门禁密码每月更新。",
        "How often does the Taipei office change its access code?",
    ),
    ("The invoice must be paid before September fifteenth.", "发票付款截止日是哪天？"),
    ("我家猫叫豆豆，今年四岁。", "What is the name and age of my cat?"),
    ("The production server is hosted in Singapore.", "生产服务器位于哪个国家？"),
    ("周末计划去阳明山爬山。", "Where are we going hiking this weekend?"),
    ("Maria prefers email over phone calls.", "Maria喜欢用什么方式联系？"),
    ("上传附件最大不能超过二十兆。", "What is the attachment size limit?"),
    ("The train to Kyoto leaves at eight thirty.", "去京都的火车几点出发？"),
    (
        "登录失败五次后账号会锁定十分钟。",
        "What happens after five failed login attempts?",
    ),
    ("Our refund policy allows returns within thirty days.", "退货期限是多久？"),
    (
        "咖啡机坏了，需要更换水泵。",
        "Which part of the coffee machine needs replacement?",
    ),
    ("The dog needs its vaccination next Monday.", "狗什么时候需要打疫苗？"),
    ("新版本修复了手机上的闪退问题。", "What mobile bug was fixed in the new release?"),
    ("Sam works remotely on Wednesdays.", "Sam每周哪天远程工作？"),
    ("客厅的墙准备刷成浅绿色。", "What color will the living room walls be?"),
    ("The museum is closed on Tuesdays.", "博物馆哪天不开门？"),
    (
        "客户希望导出的报表使用CSV格式。",
        "Which format does the customer want for exported reports?",
    ),
    ("The bicycle has a flat rear tire.", "自行车哪个轮胎漏气了？"),
    ("晚餐订了六点半的意大利餐厅。", "What time is our Italian dinner reservation?"),
    ("The API token expires after ninety days.", "API令牌多久过期？"),
]


def runtime_settings(provider):
    if provider.provider_name == "onnx":
        options = provider._session.get_session_options()
        return {
            "intra_op_threads": options.intra_op_num_threads,
            "execution_mode": str(options.execution_mode),
            "graph_optimization": str(options.graph_optimization_level),
            "cpu_mem_arena": options.enable_cpu_mem_arena,
            "batch_size": provider.batch_size,
        }
    import torch

    return {"intra_op_threads": torch.get_num_threads()}


async def encode():
    from hindsight_api.engine.embeddings import create_embeddings_from_env

    start = time.perf_counter()
    p = create_embeddings_from_env()
    await p.initialize()
    loaded = time.perf_counter()
    docs = p.encode_documents([x[0] for x in pairs])
    queries = [p.encode_query([x[1]])[0] for x in pairs]
    assert len(docs) == len(queries) == len(pairs)
    assert all(len(row) == 384 for row in list(docs) + queries)
    first = time.perf_counter()
    for _ in range(3):
        p.encode_documents([x[0] for x in pairs])
        for _, q in pairs:
            p.encode_query([q])
    end = time.perf_counter()

    def plain(x):
        return x.tolist() if hasattr(x, "tolist") else x

    print(
        json.dumps(
            {
                "provider": p.provider_name,
                "runtime": runtime_settings(p),
                "documents": plain(docs),
                "queries": [plain(x) for x in queries],
                "labels": pairs,
                "load_seconds": loaded - start,
                "first_pass_seconds": first - loaded,
                "warm_pass_seconds": (end - first) / 3,
                "peak_rss_mib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
                / 1024,
            }
        )
    )


async def profile():
    from hindsight_api.engine.embeddings import create_embeddings_from_env

    provider = create_embeddings_from_env()
    await provider.initialize()
    documents = [document for document, _ in pairs]
    queries = [query for _, query in pairs]
    # Exercise the 128-token truncation boundary and multiple document batches.
    long_documents = [
        (documents[index % len(documents)] + " ") * 40 for index in range(64)
    ]
    samples = {}
    for name, run in [
        ("queries24", lambda: [provider.encode_query([query]) for query in queries]),
        ("docs24", lambda: provider.encode_documents(documents)),
        ("long64", lambda: provider.encode_documents(long_documents)),
    ]:
        run()
        durations = []
        for _ in range(5):
            start = time.perf_counter()
            run()
            durations.append(time.perf_counter() - start)
        samples[name] = durations
    print(
        json.dumps(
            {
                "provider": provider.provider_name,
                "runtime": runtime_settings(provider),
                "stats": {
                    name: {
                        "median": statistics.median(values),
                        "min": min(values),
                        "max": max(values),
                    }
                    for name, values in samples.items()
                },
                "samples": samples,
                "peak_rss_mib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
                / 1024,
            }
        )
    )


def unit(rows):
    result = []
    for row in rows:
        assert len(row) == 384 and all(math.isfinite(value) for value in row)
        norm = math.sqrt(sum(value * value for value in row))
        assert norm > 0
        result.append([value / norm for value in row])
    return result


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def compare(old, new):
    assert old["labels"] == new["labels"]
    assert all(
        len(data[key]) == len(pairs)
        for data in (old, new)
        for key in ("documents", "queries")
    )
    a, b = unit(old["documents"]), unit(new["documents"])
    x, y = unit(old["queries"]), unit(new["queries"])

    def ranks(d, q):
        return [
            sorted(range(len(d)), key=lambda i: dot(v, d[i]), reverse=True) for v in q
        ]

    base = ranks(a, x)
    results = {}
    for name, d, q in [
        ("fp32", a, x),
        ("old_docs_int8_query", a, y),
        ("mixed_even_int8", [v if i % 2 else b[i] for i, v in enumerate(a)], y),
        ("mixed_odd_int8", [v if i % 2 == 0 else b[i] for i, v in enumerate(a)], y),
        ("all_int8", b, y),
    ]:
        r = ranks(d, q)
        results[name] = {
            "top1_correct": sum(v[0] == i for i, v in enumerate(r)),
            "top3_correct": sum(i in v[:3] for i, v in enumerate(r)),
            "top1_agreement": sum(u[0] == v[0] for u, v in zip(base, r)),
            "mean_top5_overlap": sum(
                len(set(u[:5]) & set(v[:5])) / 5 for u, v in zip(base, r)
            )
            / len(r),
            "misses": [
                {
                    "query": old["labels"][i][1],
                    "expected": old["labels"][i][0],
                    "actual": old["labels"][v[0]][0],
                    "expected_cosine": dot(q[i], d[i]),
                    "actual_cosine": dot(q[i], d[v[0]]),
                }
                for i, v in enumerate(r)
                if v[0] != i
            ],
        }
    for name, u, v in [("document_cosine", a, b), ("query_cosine", x, y)]:
        c = [dot(i, j) for i, j in zip(u, v)]
        results[name] = {"min": min(c), "mean": sum(c) / len(c), "max": max(c)}
    for name, data in [("old", old), ("new", new)]:
        results[name] = {
            k: data[k]
            for k in (
                "load_seconds",
                "first_pass_seconds",
                "warm_pass_seconds",
                "peak_rss_mib",
            )
        }
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    if sys.argv[1:] == ["encode"]:
        asyncio.run(encode())
    elif sys.argv[1:] == ["profile"]:
        asyncio.run(profile())
    elif len(sys.argv) == 4 and sys.argv[1] == "compare":
        with open(sys.argv[2]) as a, open(sys.argv[3]) as b:
            compare(json.load(a), json.load(b))
    else:
        raise SystemExit(__doc__)
