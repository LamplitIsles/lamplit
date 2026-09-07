## 让经历产生连接

图谱记忆是 Partner 对人物、事件、偏好与关系的长期、相互连接的记忆。它不同于一份聊天记录，也不同于某次请求临时提供给模型的上下文。

Lamplit Full 使用 Hindsight 提供这项能力。Core 不包含 Hindsight；Core 自身的状态与工作空间持久化不等于图谱记忆。

记忆图谱是查看这些连接的一种方式。

## 记忆的边界

长期记忆为跨对话的连续性提供基础。保存和回忆的内容取决于模型服务与集成设置，检索结果可能不完整或不准确，因此重要内容应保留独立副本。

你可以把图谱看作共同经历的线索，帮助 Partner 在后续相处中联系起早先的对话。

## 数据在哪里

Hindsight 的持久记忆保存在 Full 的 PostgreSQL 卷 `lamplit-hindsight-postgres` 中。Hindsight 容器本身的文件系统和模型缓存不作为持久数据。

Partner 工作空间、DSH 状态、Keet 身份与数据库分别备份。只保存其中一个卷，不能恢复完整的部署。

## 备份记忆

在 Full 的 Compose 目录中、保持原有环境变量可用，暂停 Hindsight 写入并生成 PostgreSQL 自定义格式备份：

```bash
docker compose stop hindsight
docker compose exec -T hindsight-postgres \
  pg_dump -U hindsight -d hindsight -Fc > hindsight-$(date +%Y%m%d).dump
docker compose start hindsight
```

检查命令成功、备份文件有效，再保存到私有备份位置。如果导出失败，先查看错误并恢复服务，不把残缺文件当成有效备份。

## 恢复前先验证

当前经过验证的记忆导出与导入单位是 PostgreSQL 自定义格式备份。先恢复到新的、可丢弃的兼容数据库卷中；确认 `pgroonga` 与 `vector` 扩展，以及目标镜像的 PGroonga 4.0.8、pgvector 0.8.6 版本。

确认真实记忆读取与写入成功后，再考虑切换。保留旧卷直到验证完成。完整维护背景见仓库的[容器运维文档](https://github.com/LamplitIsles/lamplit/blob/main/docs/container-operations.md)。
