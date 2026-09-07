<script lang="ts">
  import type { SiteContent } from '$lib/content';
  let { kind, copy }: { kind: 'keet' | 'memory'; copy: SiteContent['illustrations'] } = $props();
  // Deterministic geometry is rendered at build time; no graph runtime is shipped.
  const nodes = Array.from({ length: 116 }, (_, i) => {
    const angle = i * 2.399963;
    const radius = 18 + Math.sqrt(i / 115) * 169;
    return { x: 328 + Math.cos(angle) * radius * 1.12, y: 230 + Math.sin(angle) * radius * .8, warm: i % 7 === 0 || i < 14 };
  });
  const edges = nodes.flatMap((node, i) => nodes
    .map((other, j) => ({ j, distance: Math.hypot(node.x - other.x, node.y - other.y) }))
    .filter(({ j, distance }) => j > i && distance < 66)
    .sort((a, b) => a.distance - b.distance).slice(0, 3)
    .map(({ j }) => ({ from: node, to: nodes[j] })));
  const memories = $derived([
    { x: 237, y: 137, label: copy.memory.movie, lines: copy.memory.movieDetail, tx: 228, ty: 118, anchor: 'end' },
    { x: 445, y: 176, label: copy.memory.song, lines: copy.memory.songDetail, tx: 462, ty: 163, anchor: 'start' },
    { x: 404, y: 317, label: copy.memory.game, lines: copy.memory.gameDetail, tx: 419, ty: 343, anchor: 'start' },
    { x: 207, y: 294, label: copy.memory.day, lines: copy.memory.dayDetail, tx: 190, ty: 313, anchor: 'end' }
  ]);
</script>

{#if kind === 'keet'}
  <div class="illustration-phone" role="img" aria-label={copy.keet.alt}>
    <div class="phone-screen" aria-hidden="true">
      <div class="status-bar"><span>21:42</span><span class="island"></span><span>▮▮▮ ▰</span></div>
      <div class="chat-header"><span class="back">‹</span><span class="avatar">✧</span><div><strong>Partner</strong><small>{copy.keet.connection}</small></div><svg class="call" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3 3 5c-1 7 9 17 16 16l2-3-5-4-2 2c-3-1-5-3-6-6l2-2Z"/></svg></div>
      <div class="chat-body">
        <div class="chat-date">{copy.keet.today}</div>
        <div class="bubble sent">{copy.keet.sent}<small>21:40 <span>✓✓</span></small></div>
        <div class="bubble received">{copy.keet.reply}<small>21:41</small></div>
        <div class="shared-moment"><span class="moon">☾</span><span class="horizon"></span><span class="little-star">✦</span></div>
        <div class="bubble received last">{copy.keet.last}<small>21:42</small></div>
        <div class="typing"><i></i><i></i><i></i></div>
      </div>
      <div class="composer"><span>＋</span><span>{copy.keet.message}</span><span>↑</span></div>
      <div class="home-indicator"></div>
    </div>
  </div>
{:else}
  <div class="illustration-graph">
    <svg viewBox="0 0 640 420" role="group" aria-label={copy.memory.alt}>
      <defs>
        <radialGradient id="memory-aura"><stop stop-color="#417b7930"/><stop offset="1" stop-color="#11171900"/></radialGradient>
        <radialGradient id="memory-light"><stop stop-color="#e8b573" stop-opacity=".25"/><stop offset="1" stop-color="#e8b573" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="640" height="420" fill="#101619"/>
      <ellipse cx="325" cy="238" rx="260" ry="185" fill="url(#memory-aura)"/>
      <path d="M0 53H640" stroke="#ffffff12"/>
      <g fill="#879b9d" font-size="11" font-family="inherit"><text x="25" y="32" fill="#a8d3cd">✧</text><text x="48" y="32">Hindsight</text><text x="614" y="32" text-anchor="end" font-size="9" letter-spacing="2">{copy.memory.header}</text></g>
      <g stroke="#568f94" stroke-opacity=".23" stroke-width=".7">
        {#each edges as edge}<line x1={edge.from.x} y1={edge.from.y} x2={edge.to.x} y2={edge.to.y}/>{/each}
      </g>
      <g>
        {#each nodes as node, i}
          <circle cx={node.x} cy={node.y} r={i % 11 === 0 ? 9 : 5} fill={node.warm ? '#e6b477' : '#4b9daa'} opacity=".07"/>
          <circle cx={node.x} cy={node.y} r={i % 11 === 0 ? 3.3 : 1.8} fill={node.warm ? '#dfb57e' : '#6098a3'} opacity={i % 3 === 0 ? '.95' : '.65'}/>
        {/each}
      </g>
      <circle cx="328" cy="230" r="80" fill="url(#memory-light)"/>
      <g stroke="#d8ad74" fill="none"><path d="M328 230L237 137M328 230L445 176M328 230L404 317M328 230L207 294" opacity=".65"/><circle cx="328" cy="230" r="19" opacity=".24"/><circle cx="328" cy="230" r="7" fill="#ebc58f"/></g>
      <text x="328" y="266" text-anchor="middle" fill="#eed6b4" font-size="12">{copy.memory.center}</text>
      {#each memories as memory, i}
        <g data-point={i} class="memory-point" tabindex="0" role="button" aria-label={`${memory.label}: ${memory.lines.join(' ')}`}>
          <circle cx={memory.x} cy={memory.y} r="24" fill="transparent"/>
          <circle class="point-ring" cx={memory.x} cy={memory.y} r="12" fill="#dfb57e10" stroke="#dfb57e" stroke-opacity=".4"/>
          <circle cx={memory.x} cy={memory.y} r="4" fill="#e5c799"/>
          <foreignObject x={memory.anchor === 'end' ? memory.tx - 166 : memory.tx} y={memory.ty - 12} width="166" height="48">
            <div class="node-label" style:text-align={memory.anchor === 'end' ? 'right' : 'left'}>{memory.label}</div>
          </foreignObject>

        </g>
      {/each}
      {#each memories as memory, i}
        <foreignObject data-tip={i} class="memory-tooltip" aria-hidden="true" x={memory.x > 320 ? memory.x - 264 : memory.x - 10} y={memory.y > 230 ? memory.y - 180 : memory.y + 24} width="280" height="180">
          <div class="tooltip-card">
            <strong>{memory.label}</strong>
            {#each memory.lines as line}<p>{line}</p>{/each}
          </div>
        </foreignObject>
      {/each}
      <g font-size="9" fill="#91a6a4"><circle cx="27" cy="393" r="3" fill="#639eac"/><text x="39" y="396">{copy.memory.connections}</text><circle cx="184" cy="393" r="3" fill="#dfb57e"/><text x="196" y="396">{copy.memory.memories}</text><text x="613" y="396" text-anchor="end">{copy.memory.hint}</text></g>
    </svg>
  </div>
{/if}

<style>
  .illustration-phone { width: min(282px, 90%); margin-inline: auto; padding: 7px; border: 1px solid #716152; border-radius: 39px; background: linear-gradient(145deg,#3a3937,#151719 40%,#44413b); box-shadow: 0 35px 65px #0006, inset 0 0 0 2px #191a1b; transform: rotate(-3deg); }
  .phone-screen { overflow: hidden; border-radius: 32px; background: #0c1217; color: #e4e9e9; font-family: var(--sans); }
  .status-bar { height: 35px; padding: 9px 17px 0; display: flex; justify-content: space-between; font-size: 9px; align-items: start; }
  .island { background: #050709; width: 67px; height: 16px; border-radius: 12px; margin-top: -3px; }
  .chat-header { display: flex; gap: 10px; align-items: center; border-bottom: 1px solid #ffffff09; padding: 8px 14px 14px; }
  .back { color: #a4bebf; font-size: 26px; }.avatar { width: 33px; height: 33px; border-radius: 50%; display: grid; place-items: center; color: #efc989; background: radial-gradient(circle at 35% 30%,#756044,#243239 70%); font-size: 24px; }
  .chat-header strong { display: block; font-size: 12px; font-weight: 500; }.chat-header small { display: block; font-size: 8px; color: #81aaa2; margin-top: 2px; }.call { margin-left: auto; color: #b9c9c9; font-size: 24px; }
  .chat-body { min-height: 365px; padding: 18px 13px 12px; background-image: radial-gradient(circle at 20% 30%,#467d7314 1px,transparent 1.5px); background-size: 19px 23px; }
  .chat-date { text-align: center; font-size: 8px; color: #91a2a3; margin-bottom: 19px; letter-spacing: .08em; }
  .bubble { font-size: 11px; line-height: 1.65; padding: 11px 12px 7px; max-width: 88%; margin-bottom: 12px; border: 1px solid #ffffff05; }
  .sent { margin-left: auto; background: #17373b; border-radius: 14px 14px 3px 14px; }.received { background: #20262e; border-radius: 14px 14px 14px 3px; }
  .bubble small { display: block; text-align: right; font-size: 7px; color: #91a3ac; margin-top: 4px; }.bubble small span { color: #7bbbc4; }.last { margin-top: -3px; }
  .shared-moment { height: 70px; width: 88%; margin-bottom: 9px; border: 1px solid #77847821; border-radius: 12px 12px 12px 3px; background: linear-gradient(#182630,#2a3439 70%,#3e4038); position: relative; overflow: hidden; }
  .moon { position: absolute; top: 6px; left: 31px; color: #ebd9b8; font: 33px Georgia,serif; transform: rotate(-25deg); }.horizon { position: absolute; left: -10%; bottom: -35px; width: 120%; height: 55px; border-radius: 50%; background: #131e24; transform: rotate(-9deg); }.little-star { position: absolute; color: #c9c0a4; font-size: 8px; top: 22px; right: 37px; }
  .typing { display: flex; gap: 3px; width: 33px; padding: 8px 9px; background: #20262e; border-radius: 12px; }.typing i { height: 3px; width: 3px; background: #8d9b9e; border-radius: 50%; }
  .composer { display: flex; gap: 9px; padding: 9px 11px; margin: 0 10px; align-items: center; border-radius: 22px; color: #8a959e; background: #20262e; font-size: 10px; }.composer span:first-child { font-size: 16px; }.composer span:last-child { margin-left: auto; border-radius: 50%; background: #82b9b1; color: #152529; width: 22px; height: 22px; text-align: center; line-height: 22px; }
  .home-indicator { height: 3px; width: 82px; border-radius: 3px; background: #b4b7b8; margin: 12px auto 7px; }
  .node-label { font-size: 12px; line-height: 1.4; color: #d3ded9; }
  .tooltip-card { padding: 14px 16px; border: 1px solid #9e8b68a6; border-radius: 8px; background: #1c292c; color: #d3dfdc; font-size: 12px; line-height: 1.55; }
  .tooltip-card strong { display: block; color: #e8c693; font-weight: 500; margin-bottom: 7px; }
  .tooltip-card p { margin: 0; color: inherit; font-size: inherit; line-height: inherit; }
  .tooltip-card p + p { margin-top: 5px; }
  .memory-point { outline: none; cursor: help; }
  .memory-tooltip { opacity: 0; pointer-events: none; transition: opacity .18s ease; }
  .point-ring { transition: r .18s ease, stroke-opacity .18s ease; }
  svg:has([data-point="0"]:is(:hover, :focus)) [data-tip="0"] { opacity: 1; }
  svg:has([data-point="1"]:is(:hover, :focus)) [data-tip="1"] { opacity: 1; }
  svg:has([data-point="2"]:is(:hover, :focus)) [data-tip="2"] { opacity: 1; }
  svg:has([data-point="3"]:is(:hover, :focus)) [data-tip="3"] { opacity: 1; }
  .memory-point:hover .point-ring, .memory-point:focus .point-ring { r: 17px; stroke-opacity: 1; }
  @media (prefers-reduced-motion: reduce) { .memory-tooltip, .point-ring { transition: none; } }
  .illustration-graph { border: 1px solid #5c615445; border-radius: 9px; overflow: hidden; box-shadow: 0 30px 65px #0004; }.illustration-graph svg { display: block; width: 100%; height: auto; }
</style>
