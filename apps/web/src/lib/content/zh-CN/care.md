## 模型与凭据

打开 DSH 后，配置你选择的模型服务。API 密钥和 OAuth 授权属于运行时凭据，应放在 DSH 凭据存储或私有 secrets 中。

使用远程模型、研究或邮件服务时，相关内容仍会交给对应服务商处理。自行部署意味着你控制运行环境与持久化数据，并不表示所有能力完全离线。

## 首次配置覆盖

镜像提供两个示例文件：

```text
/opt/lamplit/settings.example.yaml
/opt/lamplit/profile.patch.example.yml
```

准备自己的文件，以只读方式挂载。在 Core 的完整启动命令中、镜像名称前加入：

```bash
--volume "$PWD/settings.yaml:/etc/lamplit/settings.override.yaml:ro" \
--env LAMPLIT_SETTINGS_OVERRIDE=/etc/lamplit/settings.override.yaml \
--volume "$PWD/profile.patch.yml:/etc/lamplit/profile.override.yml:ro" \
--env LAMPLIT_PROFILE_OVERRIDE=/etc/lamplit/profile.override.yml \
```

设置只写入新的空状态卷；已有状态不会被覆盖。Profile patch 是最终补丁层，不会被静默安装到状态中。日常设置请通过已有运行环境管理，不要用重置状态卷的方式更新配置。

## 邮箱是另一项可选连接

Partner 邮箱是一份属于 Partner 的真实电子邮件地址。Lamplit 自带集成，但不提供现成地址或 OAuth 授权。需要在 DSH 中对接由你运营的兼容 mailbox MCP 和 OAuth issuer。没有配置时，邮箱集成保持未启用，不妨碍启动。

## 分别保存这些数据

| 数据 | Core 卷名 | Full 卷名 |
| --- | --- | --- |
| DSH 状态与会话 | `lamplit-core-state` | `lamplit-dsh-state` |
| Partner 工作空间 | `lamplit-core-workspace` | `lamplit-partner-workspace` |
| Keet 身份 | `lamplit-core-keet` | `lamplit-keet-identity` |
| Hindsight 记忆 | 不适用 | `lamplit-hindsight-postgres` |
| Codex Bridge 授权 | 不适用 | `lamplit-codex-bridge-auth` |

复制文件型卷前，先停止写入它们的服务。数据库按[记忆备份指南](/docs/memory/)导出。身份、授权和备份都应私密保存。

DSH 状态路径是 `/home/lamplit/.local/state/dsh`；Partner 工作空间是 `/workspace`。不要合并这两项持久化边界。

## 升级

先备份，再选择明确的版本。Core 使用 `X.Y.Z`，Full 使用 `X.Y.Z-full`；滚动标签分别是 `latest` 与 `full`，没有 `full-latest`。

Full 可通过 `LAMPLIT_IMAGE` 选择应用镜像，然后更新 Compose。独立记忆服务与 Codex Bridge 使用各自的版本和摘要，不随应用版本号一起替换。

保留原有命名卷。初次启动时的种子配置不会覆盖已有文件；升级不会自动迁移托管账号、Keet 身份或邮箱数据。

## 常见问题

**界面打不开**：先检查容器状态和日志。默认端口只绑定 `127.0.0.1`；远程部署需要 SSH 转发或另行配置的认证代理。

```bash
# Core
docker ps --filter name=lamplit-core
docker logs lamplit-core --tail=100

# Full
docker compose ps
docker compose logs --tail=100 lamplit hindsight hindsight-postgres codex-bridge
```

**Partner 没有长期记忆**：确认使用 Full，检查 Hindsight 和数据库服务状态。密码应在两个服务间保持一致，数据库卷需要允许 uid 999 写入。

**Keet 未连接**：检查受支持的运行环境是否只读挂载到 `/opt/keet-runtime`，并且可读。不要把运行程序复制进身份卷。

**Bridge 未授权**：按 [Full 指南](/docs/full/)完成部署者登录，再单独重启 `codex-bridge`。

## 许可与支持边界

Lamplit 是独立社区发行版，源码公开，采用 Elastic License 2.0，允许合规免费自托管。它不是 OSI 意义上的开源项目，也不是 DeepSeek 官方产品。上游组件保留各自许可。

官方托管服务目前尚未开放。当前版本也不承诺一键公网接入、自动账号迁移或受支持运行组合之外的平台支持。许可原文见[仓库 LICENSE](https://github.com/LamplitIsles/lamplit/blob/main/LICENSE)。
