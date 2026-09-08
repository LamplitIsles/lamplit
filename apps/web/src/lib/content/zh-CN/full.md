## Full 带来什么

Full 在 Core 的能力上增加 Hindsight 图谱记忆、图像生成、PostgreSQL 记忆存储与 Codex Bridge。它使用四个服务：

- `lamplit`：Web 与 Companion 应用。
- `hindsight`：长期记忆服务。
- `hindsight-postgres`：记忆数据库。
- `codex-bridge`：使用部署者自己的 ChatGPT OAuth 登录。

Core 与 Full 是运行能力的不同组合，并不是免费版与付费版。模型费用与机器资源费用由你承担。

## 准备部署目录

需要支持 AVX2 的 Linux amd64 主机、Docker 和 Docker Compose。Full 默认使用在 CPU 上运行的 ONNX INT8 记忆向量模型，Hindsight 的 CPU 配额为 4。取得[公开仓库](https://github.com/LamplitIsles/lamplit)的完整检出，在仓库根目录运行以下命令。部署时建议选定一个已发布的稳定版本。

```bash
export HINDSIGHT_POSTGRES_PASSWORD='replace-with-a-long-private-value'
mkdir -p keet-runtime
docker compose up -d
```

**将占位密码换成自己的强密码**，并保存在私有的部署环境中。以后操作 Compose 时仍需提供相同的环境变量。不要提交密码到仓库。

空的 `keet-runtime` 目录允许暂不启用 Keet。完整的 Keet 接入步骤见[在 Keet 里相伴](/docs/keet/)。

仓库的 `compose.yaml` 已固定应用版本和独立服务的镜像摘要。直接使用这些引用；记忆服务无需在本地构建。

已有部署在更新仓库后不会自动更换运行中的容器。请在计划的升级时段应用新镜像，并保留原有 PostgreSQL 卷和已存储的记忆向量。

## 登录 Codex Bridge

镜像中没有账号凭据。使用你自己的登录授权：

```bash
docker compose run --rm --entrypoint /usr/local/bin/kepos-codex-bridge \
  codex-bridge login \
  --auth-file /var/lib/kepos-codex-bridge/auth.json

docker compose restart codex-bridge
```

这一步需要由你完成，可能打开浏览器。授权数据保存在独立卷内，不要复制进镜像或仓库。其他模型服务的密钥在 DSH 中配置。

## 检查并打开

```bash
docker compose ps
docker compose logs --tail=20 lamplit
```

打开日志中带令牌的 Web 地址，完成登录后进入 [Companion](http://127.0.0.1:3080/companion/)。远程部署时先按 [Core 指南](/docs/start/)建立 SSH 转发。

应用和控制端口默认只绑定主机回环地址，数据库没有主机端口。如需公网访问，需另行配置 TLS、认证代理和网络规则。

## 已经在使用 Core？

先备份 Core 的状态与工作空间。Full 的默认卷名与 Core 不同，直接启动 Full **不会自动接续 Core 的数据**。本版本没有通用的一键迁移流程；不要把不同持久化边界合并到一个目录，也不要让两个应用同时写入同一份状态。

先了解[长期记忆](/docs/memory/)和[备份边界](/docs/care/)，再安排已有数据的迁移。
