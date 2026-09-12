# Partner 输入、情绪与提示词审计

2026-09-12。范围为独立 `apps/partner`，对照本机 dsh-plugins 的
`dsh-companion` 和 `dsh-speech` 源码。原版仓库只读；这是实现与契约审计，
不是模型行为 A/B 实验，也不声称做过真实麦克风验收。

## 本次修复

- 删除 Hindsight 客户端、recall 注入、reflect 工具、retain outbox、配置和凭据入口。
  连续性来自持久会话及 naco 压缩摘要，不增加替代记忆系统。
- 当前关系状态注入加上 `<companion-context>` 标记，与摘要提示词约定一致。
  同时删除主提示词中要求调用记忆能力的描述。
- 关系历史入口改为头像左侧汉堡按钮，删除右侧入口。关系面板从左侧向右滑入，遮罩位于右侧。

现存 SQLite 中旧的 memory_jobs 表不再读取或写入；不为清理而删除历史数据。
旧 DSH 容器分发与独立 Hindsight 服务不属于此次 Partner 运行时改动。

## STT 与用户输入

| 行为 | 原版 DSH Companion | 独立 Partner |
| --- | --- | --- |
| 完成转写 | 自动发送一个文本 turn | 追加到当前草稿，用户确认后发送 |
| 模型收到的语音信息 | `🎙️ 文本 [expression]`，有表达标注时附加 | `🎙️ 文本 [expression]`；本次恢复语音来源与已识别语气 |
| 正在编辑的草稿 | 自动语音发送独立于草稿 | 追加而不覆盖草稿，保留待发送图片 |
| 录音管理 | VoiceRecordingController | 同一实现：格式、时长/大小限制、取消、轨道清理 |
| 中文输入法 | composition 状态阻止 Enter 提交 | 同一 composer 实现；Shift+Enter 换行 |
| 消息执行 | DSH Session 投影 | 乐观消息 + HTTP 单消息提交 + naco FIFO 队列 |
| 浏览器更新 | DSH 订阅链路 | SSE 通知后拉取有界增量，历史分页 |

原版 ASR 与当前均使用 Qwen ASR、`enable_itn: true`，默认不强制中文。
原版的 `language_type: Chinese` 属于 TTS 请求，不能据此认定 STT 语言设置丢失。
原版 ASR 可传可选 language；当前没有语言选择入口。当前只提供 STT，不提供 TTS。
服务端对音频和响应设大小限制，客户端断开/取消及超时可中断请求；转写本身不创建模型 turn。

**本次修复的输入差异：** 语音 expression 经白名单规范化后保留，未知标注忽略；
格式化文本追加到可编辑草稿，不自动发送。

消息限制统一为 16,000 UTF-16 字符单位，按 trim 后的文本校验。超长草稿即时显示
当前长度与上限，禁用发送且 Enter 不提交；不截断草稿。服务端 schema 拒绝返回
422/invalid_message，界面将其与未知送达区分，不保留网络重试 ID。

## Companion 情绪

`runtime/tools/companion.ts` 提供情绪/亲近度更新、签名更新、近期关系历史读取。
`runtime/store.ts` 事务持久化状态，按 operation/call ID 去重；亲近度每轮净变化最多
±10，并限制在 0–100。情绪枚举、文本长度与原因校验沿用原领域规则。
首个状态为 neutral / 50 / 空签名，不凭空生成一次关系变化记录。

这是 Companion 自身表达的状态，不是用户录音的情绪识别结果；没有每轮自动情绪分类器。
模型没有调用工具就不会改变界面状态。当前情绪不应限制其表达，更不是需要优化的分数。
状态在 queued turn 真正执行时注入，避免排队期间提前拍下过时状态。
关系历史来自本地 SQLite，不依赖 Hindsight；移除 Hindsight 不删除关系变化记录。

## Prompt

`runtime/partner.ts` 将陪伴基础提示词、基础工具说明和 TOML 指定 persona 作为
`Agent.create.instructions` 提交。naco SDK 的该接口是外部完整替换语义，
不会再叠加默认 coding identity；没有 DSH Host 参与这条路径。
参考 naco `js/nanocodex/README.md` 的 Current execution context and owned work 契约。

基础提示词保留独立情绪、需求和边界、非任务导向交流、行动权限、证据意识、
技能复用与代码模式说明。工具说明覆盖 QuickJS、text/image、shell 会话、
apply_patch、图片文件路径和 skill CLI。persona 文件负责个体身份，不把 Yuki 写入基础层。

压缩由独立陪伴摘要提示词负责，保持八段连续性结构；最近文本最多五轮，4k tokens
软预算，最新完整轮可超预算；未完成轮保留执行后缀。这些没有被 Hindsight 删除改变。
`<companion-context>` 只作为当前元数据，不应仅因其出现就保存瞬时分数。
提示词能引导行为，但本审计不以源码比较替代真实会话效果评估。

## 验证

此前 `pnpm run check` 通过；本次输入及面板修复后重跑 Partner Svelte 检查、生产构建及 20 项隔离测试，全部通过。
涵盖无记忆服务的 SDK 调用、队列取消、SIGKILL 恢复、压缩重启、工具、STT 与关系事务。
开发实例 localhost:3082 已更新；agent-browser 验证桌面及 390px 窄屏：
按钮在头像左侧、右侧无入口、关系面板从左滑入且 Escape 关闭、无横向溢出。
浏览器拦截请求验证 16,001 字符草稿不提交，422 拒绝恢复草稿并显示校验提示；未向真实模型发送这些测试消息。
