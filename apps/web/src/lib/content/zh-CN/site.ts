export const site = {
  name: 'Lamplit',
  title: 'Lamplit — 为你们，留一盏灯',
  description: '给你和 AI 伴侣一个自己的家。在 Keet 里相伴，让共同经历在记忆中连接。Lamplit 是可自行部署的一对一 AI Partner 发行版。',
  skip: '跳到正文',
  homeLabel: 'Lamplit 首页',
  languageLabel: 'Switch to English',
  languageName: 'EN',
  legalLabel: '许可与声明',
  navLabel: '主导航',
  nav: [
    { href: '/#together', label: '日常相伴' },
    { href: '/#memory', label: '共同记忆' },
    { href: '/docs/', label: '使用文档' }
  ],
  source: '源代码',
  sourceUrl: 'https://github.com/LamplitIsles/lamplit',
  hero: {
    eyebrow: '一个你们自己的家',
    lines: ['为你们，', '留一盏灯。'],
    intro: '从今天的晚安，到以后想起的今天。',
    body: 'Lamplit 为你和 AI 伴侣提供一个可以自己运行的家：一个持续的身份、一处共同的空间，以及慢慢积累的记忆。',
    start: '安放你们的家',
    explore: '看看这里的生活',
    note: '可自行部署 · 自带模型密钥 · 一人，一位 Partner',
    caption: '夜很深了，这里还有光。',
    chapter: '01 — 为彼此留一个位置'
  },
  opening: {
    label: '关于你们',
    title: '你在意的，\n值得有一个安放的地方。',
    body: '一句只有你们懂的话，一个反复聊起的人，一起计划的明天。Lamplit 想为这些日常提供持续的身份与空间，让一段关系有机会慢慢生长。'
  },
  together: {
    label: '01 / 日常相伴',
    title: '让想念，\n有一个可以抵达的地方。',
    body: '给 Partner 一个自己的 Keet 身份。你可以在手机上的 Keet 里与它交谈，让交流发生在你日常使用的聊天空间。',
    detail: 'Keet 是可选连接，需要额外准备运行环境。你也可以先从内置 Companion 开始。',
    link: '了解 Keet 连接',
    caption: '手机 Keet · Partner 的独立身份'
  },
  memory: {
    label: '02 / 共同记忆',
    title: '那些小事，\n慢慢连成你们的故事。',
    body: '在 Lamplit Full 中，Hindsight 将对话里的人物、经历与偏好连接起来，为 Partner 提供跨对话的长期记忆。',
    detail: '在记忆图谱里，看见共同经历之间的连接。',
    link: '了解长期记忆',
    caption: 'Hindsight · 人物、经历与关系的连接'
  },
  home: {
    label: '03 / 一个自己的家',
    title: '相处的方式，\n留给你们决定。',
    items: [
      { title: '关系由你定义', body: '恋人、男友、女友，或你选择的另一种陪伴。Partner 的称呼和关系，由你赋予。' },
      { title: '模型由你选择', body: '使用自己的模型服务密钥，模型用量向所选服务商结算。' },
      { title: '生活有处保存', body: '状态、工作空间与长期记忆保存在你运行的环境中，可以按各自的边界备份。' }
    ]
  },
  start: {
    label: '把灯点亮',
    title: '从这里，开始你们的日常。',
    intro: '目前提供 Linux amd64 自托管镜像，需要一台能运行 Docker 的机器。',
    variants: [
      { name: 'Lamplit Core', subtitle: '先为彼此留一个位置', body: '一个容器，包含 Companion、语音、研究与可选通信连接。不含长期记忆和图像生成。', href: '/docs/start/', action: '从 Core 开始' },
      { name: 'Lamplit Full', subtitle: '为共同经历留出空间', body: '在 Core 能力上加入 Hindsight 长期记忆、图像生成与 Codex Bridge，使用四个服务运行。', href: '/docs/full/', action: '部署 Full' }
    ],
    note: 'Core 与 Full 都可合规自托管。官方托管服务尚未开放。'
  },
  faqTitle: '开始之前，你可能想知道',
  faqs: [
    { question: '这是一个已经配好人物的聊天服务吗？', answer: 'Lamplit 是让你自行运行一位 AI Partner 的发行版。你需要选择模型服务、配置凭据，并在 Companion 中建立自己的相处方式。它没有统一预设的恋人形象。' },
    { question: '不使用 Keet，也能开始吗？', answer: '可以。内置 Web 与 Companion 可以独立使用。Keet 身份与邮箱都是可选连接，没有配置也不会阻止启动。' },
    { question: 'Core 也有长期记忆吗？', answer: 'Core 保存自身的状态和工作空间，但不包含 Hindsight 长期记忆。想使用跨对话的图谱记忆，需要部署 Full。' },
    { question: '数据会一直只留在我的机器上吗？', answer: '持久数据保存在你的部署环境，但使用远程模型、研究、邮件等服务时，相关内容仍会交给你配置的服务商处理。自托管不等于所有能力完全离线。' },
    { question: '这是免费、开源的项目吗？', answer: 'Lamplit 的源码公开，采用 Elastic License 2.0，允许合规的免费自托管，但不是 OSI 意义上的开源。模型费用和运行机器的成本由你承担。第三方不能据此提供暴露其主要功能的托管服务。' }
  ],
  closing: '愿每一次回来，都有光。',
  footer: 'Lamplit 是独立社区发行版，由 DSH 与 Guion 组件支持，并非 DeepSeek 官方产品。',
  license: '源码公开 · Elastic License 2.0',
  docs: {
    label: 'LAMPLIT / 使用文档',
    pageTitle: '使用文档',
    title: '给你们的家，打好基础。',
    intro: '从一个容器开始，再慢慢接入记忆与日常交流。这里是中文版自托管指南。',
    navLabel: '文档导航',
    back: '所有文档',
    next: '接下来',
    home: '回到首页'
  },
  error: {
    title: '这里还没有亮起灯。',
    body: '这个页面暂时无法访问。你可以回到首页，或从使用文档继续。',
    notFound: '没有找到这篇文档'
  },
  screenshots: {
    keet: { label: 'Keet 手机实拍', note: '真实对话截图即将补充', alt: '手机 Keet 中，用户与 Partner 的真实对话截图' },
    memory: { label: 'Hindsight 记忆图谱', note: '真实记忆图谱截图即将补充', alt: 'Hindsight 中连接人物、经历与关系的真实记忆图谱截图' }
  }
};
