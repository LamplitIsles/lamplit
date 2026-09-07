## 开始前

准备一台 **Linux amd64** 机器，安装 Docker，并能拉取 GHCR 镜像。当前镜像不承诺支持 ARM 或 Apple Silicon 原生运行。

Core 包含 Web、Companion、语音、研究、邮箱集成与可选 Keet 连接。不包含 Hindsight 长期记忆或图像生成。需要这两项能力时，请阅读[部署 Full](/docs/full/)。

你无需模型密钥就能打开界面；真正与 Partner 对话时，需要配置模型服务与凭据。邮箱、Keet 都可以以后再接入。

## 启动 Core

下面创建三个持久卷，分别保存 DSH 状态、Partner 工作空间和 Keet 身份。即使暂不使用 Keet，也保留这个独立身份卷。

```bash
docker volume create lamplit-core-state
docker volume create lamplit-core-workspace
docker volume create lamplit-core-keet

docker run -d --name lamplit-core \
  --user 1000:1000 \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,noexec,nosuid,size=256m,mode=1777 \
  --publish 127.0.0.1:3080:3080 \
  --volume lamplit-core-state:/home/lamplit/.local/state/dsh \
  --volume lamplit-core-workspace:/workspace \
  --volume lamplit-core-keet:/var/lib/lamplit/keet \
  --volume lamplit-core-keet:/workspace/.dsh/dsh-keet \
  ghcr.io/lamplitisles/lamplit:latest
```

`latest` 是滚动的 Core 标签。需要可重复的升级与回退时，改用[已发布版本](https://github.com/LamplitIsles/lamplit/tags)对应的 `X.Y.Z` 标签。

## 打开你们的空间

查看日志中的一次性带令牌 Web 地址，在浏览器打开它：

```bash
docker logs lamplit-core --tail=20
```

完成 Web 登录后，可进入 [Companion](http://127.0.0.1:3080/companion/)。在 DSH 中配置自己的模型服务与凭据，再开始与 Partner 相处。这里没有预置的恋人形象；你可以选择称呼，以及男友、女友或其他陪伴关系。

如果 Docker 运行在远程机器，浏览器里的 `127.0.0.1` 指向你手上的设备，需要先建立 SSH 端口转发。将示例里的账号和主机替换成自己的：

```bash
ssh -L 3080:127.0.0.1:3080 your-user@your-host
```

保持 SSH 连接，再打开本地地址。日志中的令牌属于访问凭据，不要公开分享。

## 重启与保存

```bash
docker restart lamplit-core
```

重启不会重新覆盖已有状态。初始配置只在状态卷为空时写入。DSH 状态与 Partner 工作空间是两份不同的数据，请分别备份，也不要直接接入一个已有的个人 DSH 主目录。

下一步可以[接入 Keet](/docs/keet/)，或先了解[设置与备份](/docs/care/)。
