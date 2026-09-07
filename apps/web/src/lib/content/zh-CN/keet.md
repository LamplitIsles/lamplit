## 两个独立的身份

你在手机上使用自己的 Keet 身份。Partner 使用另一份独立的 Keet 身份，参与 Keet 对话。它不是你个人账号的共用登录，也不是邮箱。

Keet 连接是可选的。没有准备好运行环境时，Lamplit 与 Companion 仍能运行；集成会显示未连接或待设置状态。

## 准备 Partner 的运行环境

Lamplit 提供集成，但不分发 Keet 的专有程序、worker 或原生扩展。

按[上游运行环境准备指南](https://github.com/lamplitisles/keet-for-agent/blob/main/docs/runtime-extraction.md)取得受支持的 **Keet 4.21.0 Linux x86-64** 官方发行包，验证校验和并提取运行文件。将生成的 `4.21.0-linux-x64` 目录放在仓库之外。

这份运行环境属于 Partner 所在的 Linux 主机，与你手机上的 Keet 安装不同。

## 接入 Core

在 [Core 启动命令](/docs/start/)的镜像名称前增加这个只读挂载，并把路径替换为实际目录：

```bash
--volume "/absolute/path/to/4.21.0-linux-x64:/opt/keet-runtime:ro" \
```

如果容器已创建，Docker 不能直接修改它的挂载。先备份，停止并移除原容器，再用包含新挂载的完整命令创建容器；保留原来的三个命名卷，不要删除卷。

## 接入 Full

在仓库根目录设置路径，再更新 Compose：

```bash
export KEET_RUNTIME_PATH=/absolute/path/to/4.21.0-linux-x64
docker compose up -d
```

继续提供原先的数据库密码环境变量。确认 DSH 中的 Keet 集成已连接，再按集成提供的会话邀请或连接流程，让你手机上的 Keet 与 Partner 进入同一个会话。具体控制项以上游当前界面为准。

## 保存身份

运行程序以只读方式挂在 `/opt/keet-runtime`；Partner 的身份保存在另一份可写卷中。两者不能混在一起：程序可以重新取得，身份数据需要私密备份。

当前没有经过验证的一键 Keet 身份跨环境导入导出流程，不把复制程序目录当作身份迁移。
