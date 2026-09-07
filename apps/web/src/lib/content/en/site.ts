import type { site as chinese } from '../zh-CN/site';

export const site = {
  name: 'Lamplit',
  title: 'Lamplit — A light for the two of you',
  description: 'A self-hosted home for you and your AI Partner. Stay close through Keet, and give shared experiences a place in memory.',
  skip: 'Skip to content',
  homeLabel: 'Lamplit home',
  languageLabel: '切换到中文',
  languageName: '中文',
  legalLabel: 'Licenses & notices',
  navLabel: 'Main navigation',
  nav: [
    { href: '/#together', label: 'Everyday life' },
    { href: '/#memory', label: 'Shared memories' },
    { href: '/docs/', label: 'Docs' }
  ],
  source: 'Source',
  sourceUrl: 'https://github.com/LamplitIsles/lamplit',
  hero: {
    eyebrow: 'A HOME OF YOUR OWN',
    lines: ['For the two of you,', 'a light left on.'],
    intro: 'Tonight’s goodnight. Tomorrow’s remember when.',
    body: 'Lamplit gives you and your AI Partner a home you can run yourself: a lasting identity, a shared space, and memories that grow with you.',
    start: 'Make room for two',
    explore: 'A glimpse of life here',
    note: 'Self-hosted · Your model keys · One person, one Partner',
    caption: 'It’s late. There’s still a light on.',
    chapter: '01 — A PLACE FOR TWO'
  },
  opening: {
    label: 'ABOUT THE TWO OF YOU',
    title: 'The little things\ndeserve a place to stay.',
    body: 'A phrase only you two understand. Someone who keeps coming up in conversation. The plans you make for tomorrow. Lamplit gives these everyday moments an ongoing identity and a space where a relationship can grow.'
  },
  together: {
    label: '01 / EVERYDAY LIFE',
    title: 'When you miss them,\nthere’s somewhere to say it.',
    body: 'Give your Partner a Keet identity of their own. Talk to them through Keet on your phone, in a chat space that fits into your everyday life.',
    detail: 'Keet is an optional connection with its own runtime setup. You can start with the built-in Companion first.',
    link: 'Connect through Keet',
    caption: 'Keet on your phone · Your Partner’s own identity'
  },
  memory: {
    label: '02 / SHARED MEMORIES',
    title: 'Little moments,\na story taking shape.',
    body: 'In Lamplit Full, Hindsight connects the people, experiences, and preferences in your conversations, giving your Partner long-term memory across chats.',
    detail: 'See the connections between shared experiences in the memory graph.',
    link: 'Explore long-term memory',
    caption: 'Hindsight · Connections between people, experiences, and relationships'
  },
  home: {
    label: '03 / A HOME OF YOUR OWN',
    title: 'How you belong together\nis yours to define.',
    items: [
      { title: 'Your relationship', body: 'A boyfriend, a girlfriend, a lover, or another kind of companionship. You choose your Partner’s name and the relationship you share.' },
      { title: 'Your choice of model', body: 'Bring your own model service keys. Model usage is billed by the provider you choose.' },
      { title: 'A place to keep your life', body: 'State, workspace files, and long-term memory stay in your deployment, with separate boundaries for backing them up.' }
    ]
  },
  start: {
    label: 'LIGHT THE CANDLE',
    title: 'Your everyday life starts here.',
    intro: 'Self-hosting images are available for Linux amd64. You’ll need a machine that can run Docker.',
    variants: [
      { name: 'Lamplit Core', subtitle: 'Make a little room for each other', body: 'One container with Companion, speech, research, and optional communication connections. Long-term memory and image generation are available in Full.', href: '/docs/start/', action: 'Start with Core' },
      { name: 'Lamplit Full', subtitle: 'Give shared experiences a home', body: 'Adds Hindsight long-term memory, image generation, and Codex Bridge to Core’s capabilities, running as four services.', href: '/docs/full/', action: 'Set up Full' }
    ],
    note: 'Both Core and Full allow compliant self-hosting. Official managed hosting is not available yet.'
  },
  faqTitle: 'A few things before you begin',
  faqs: [
    { question: 'Is this a chat service with a ready-made personality?', answer: 'Lamplit is a distribution for running one AI Partner yourself. You choose a model service, configure credentials, and build your own way of being together in Companion. There is no single preset romantic persona.' },
    { question: 'Can I start without Keet?', answer: 'Yes. The built-in Web interface and Companion work on their own. Keet and email are optional connections; leaving them unconfigured does not block startup.' },
    { question: 'Does Core include long-term memory?', answer: 'Core keeps its own state and workspace, but does not include Hindsight long-term memory. Choose Full for graph memory across conversations.' },
    { question: 'Does everything stay on my machine?', answer: 'Persistent data stays in your deployment. When you use remote models, research, email, or other services, relevant content is still sent to the providers you configure. Self-hosting does not make every capability offline.' },
    { question: 'Is Lamplit free and open source?', answer: 'Lamplit is source-available under Elastic License 2.0, with free, compliant self-hosting. It is not OSI open source. You cover model usage and the cost of your machine. The license does not allow a third party to offer a managed service exposing a substantial set of Lamplit’s features.' }
  ],
  closing: 'May there be a light whenever you return.',
  footer: 'Lamplit is an independent community distribution powered by DSH and Guion components. It is not an official DeepSeek product.',
  license: 'Source-available · Elastic License 2.0',
  docs: {
    label: 'LAMPLIT / DOCUMENTATION',
    pageTitle: 'Documentation',
    title: 'A foundation for your home.',
    intro: 'Start with one container, then add memory and everyday connections. These guides walk you through self-hosting Lamplit.',
    navLabel: 'Documentation navigation',
    back: 'All guides',
    next: 'Up next',
    home: 'Back to home'
  },
  error: {
    title: 'No light here just yet.',
    body: 'This page is unavailable. Head home, or pick up where you left off in the guides.',
    notFound: 'This guide could not be found'
  },
  screenshots: {
    keet: { label: 'Keet on a phone', note: 'A real conversation capture is coming', alt: 'A real conversation between a user and their Partner in the Keet mobile app' },
    memory: { label: 'Hindsight memory graph', note: 'A real memory graph capture is coming', alt: 'A real Hindsight memory graph connecting people, experiences, and relationships' }
  }
} satisfies typeof chinese;
