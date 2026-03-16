import { useEffect, useRef } from 'react';
import Lenis from '@studio-freight/lenis';
import { LogOut, Play } from 'lucide-react';
import './Intro.css';

interface IntroProps {
  onComplete: () => void;
  onLogout?: () => void;
}

type WorldEntry =
  | { type: 'laptop'; id: string; title: string; subtitle: string }
  | { type: 'text'; title: string }
  | { type: 'card'; id: string; title: string; subtitle: string; lines: string[]; footer: string };

const WORLD_SEQUENCE: WorldEntry[] = [
  {
    type: 'laptop',
    id: 'SYS-00',
    title: 'mirror_mind.exe',
    subtitle: 'Boot Sequence',
  },
  { type: 'text', title: 'MIRROR.MIND' },
  {
    type: 'card',
    id: 'SYS-00',
    title: 'mirror_mind.exe',
    subtitle: 'Boot Sequence',
    lines: ['Reflect. Think. Create.', 'Cognitive Processing Engine online'],
    footer: 'STATUS: READY',
  },
  { type: 'text', title: 'FEATURES' },
  {
    type: 'card',
    id: 'FEA-01',
    title: 'Zero-Knowledge',
    subtitle: 'Security',
    lines: ['Local-first thought pipeline', 'Encrypted in transit', 'Ephemeral by design'],
    footer: 'MODE: PRIVATE',
  },
  {
    type: 'card',
    id: 'FEA-02',
    title: 'Socratic Engine',
    subtitle: 'Reasoning',
    lines: ['Interrogates logic gaps', 'Clarification-first prompts', 'Context continuity'],
    footer: 'MODE: ACTIVE',
  },
  {
    type: 'card',
    id: 'FEA-03',
    title: 'Knowledge Graph',
    subtitle: 'Structure',
    lines: ['Turns thoughts into nodes', 'Exports to Notion/Obsidian', 'Live relation mapping'],
    footer: 'MODE: INDEXED',
  },
  { type: 'text', title: 'PROTOCOL' },
  {
    type: 'card',
    id: 'PRT-001',
    title: 'Signal Ingestion',
    subtitle: 'Processing_Protocol',
    lines: ['User subvocalizes raw fragments', 'Audio gets buffered + cleaned'],
    footer: 'STEP: 001',
  },
  {
    type: 'card',
    id: 'PRT-002',
    title: 'Semantic Parsing',
    subtitle: 'Processing_Protocol',
    lines: ['LLM detects entities + relations', "Maps concepts like 'Landing Page' -> 'Dark Mode'"],
    footer: 'STEP: 002',
  },
  {
    type: 'card',
    id: 'PRT-003',
    title: 'Graph Projection',
    subtitle: 'Processing_Protocol',
    lines: ['Projects concepts in 3D', 'Visual feedback validates understanding'],
    footer: 'STEP: 003',
  },
  { type: 'text', title: 'ACCESS' },
  {
    type: 'card',
    id: 'ACC-00',
    title: 'Observer',
    subtitle: '$0/mo',
    lines: ['5 sessions/mo', 'ReadOnly graph', 'Standard encryption'],
    footer: 'TIER: ENTRY',
  },
  {
    type: 'card',
    id: 'ACC-29',
    title: 'Operator',
    subtitle: '$29/mo',
    lines: ['Unlimited sessions', 'Full write access', 'Notion sync + priority processing'],
    footer: 'TIER: RECOMMENDED',
  },
  {
    type: 'card',
    id: 'ACC-CX',
    title: 'Architect',
    subtitle: 'Custom',
    lines: ['API access + private hosting', 'SSO integration + on-prem deployment'],
    footer: 'TIER: ENTERPRISE',
  },
  { type: 'text', title: 'CLARITY' },
  {
    type: 'card',
    id: 'END-01',
    title: 'From Thought To Clarity',
    subtitle: 'MirrorMind',
    lines: ['Professional cognitive workspace for structured thinking', 'Capture ideas, validate logic, and act with confidence'],
    footer: 'SYSTEM: READY FOR SESSION',
  },
];

const CONFIG = {
  starCount: 150,
  zGap: 820,
  loopSize: 0,
  camSpeed: 2.5,
};
CONFIG.loopSize = WORLD_SEQUENCE.length * CONFIG.zGap;

interface SceneItem {
  el: HTMLDivElement;
  type: 'laptop' | 'text' | 'card' | 'star';
  x: number;
  y: number;
  rot: number;
  baseZ: number;
}

const getItemPosition = (index: number, type: SceneItem['type']) => {
  if (type === 'laptop') {
    return { x: 0, y: 0, rot: 0 };
  }

  if (type === 'text') {
    return { x: 0, y: -30, rot: 0 };
  }

  const laneX = [0, -280, 280, -360, 360, -220, 220];
  const laneY = [0, -90, 90, 120, -120, 60, -60];
  const laneRot = [0, 6, -6, 10, -10, 4, -4];
  const lane = index % laneX.length;

  return {
    x: laneX[lane],
    y: laneY[lane],
    rot: laneRot[lane],
  };
};

export const Intro: React.FC<IntroProps> = ({ onComplete, onLogout }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const velReadoutRef = useRef<HTMLSpanElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const coordRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const scrollContent = scrollContentRef.current;
    const world = worldRef.current;
    const viewport = viewportRef.current;
    const velReadout = velReadoutRef.current;
    const fps = fpsRef.current;
    const coord = coordRef.current;

    if (!root || !scrollContent || !world || !viewport || !velReadout || !fps || !coord) {
      return;
    }

    const items: SceneItem[] = [];
    const laptopTypedEls: HTMLSpanElement[] = [];
    const state = {
      scroll: 0,
      velocity: 0,
      targetSpeed: 0,
      mouseX: 0,
      mouseY: 0,
    };

    WORLD_SEQUENCE.forEach((entry, i) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'hyper-item';

      if (entry.type === 'laptop') {
        const laptopEl = document.createElement('div');
        laptopEl.className = 'hyper-laptop';
        laptopEl.innerHTML = `
          <div class="hyper-laptop-screen-shell">
            <div class="hyper-laptop-screen-bevel"></div>
            <div class="hyper-laptop-screen">
              <div class="hyper-laptop-bar">
                <span class="dot red"></span>
                <span class="dot yellow"></span>
                <span class="dot green"></span>
                <span class="hyper-laptop-app">${entry.title}</span>
              </div>
              <div class="hyper-laptop-body">
                <p class="hyper-laptop-id">${entry.id}</p>
                <h2><span class="hyper-laptop-typed"></span><span class="hyper-laptop-cursor">|</span></h2>
                <p>${entry.subtitle}</p>
              </div>
            </div>
          </div>
          <div class="hyper-laptop-base"></div>
        `;
        const typedEl = laptopEl.querySelector('.hyper-laptop-typed');
        if (typedEl instanceof HTMLSpanElement) {
          laptopTypedEls.push(typedEl);
        }
        itemEl.appendChild(laptopEl);
        const pos = getItemPosition(i, 'laptop');
        items.push({
          el: itemEl,
          type: 'laptop',
          x: pos.x,
          y: pos.y,
          rot: pos.rot,
          baseZ: -i * CONFIG.zGap,
        });
      } else if (entry.type === 'text') {
        const textEl = document.createElement('div');
        textEl.className = 'hyper-big-text';
        textEl.textContent = entry.title;
        itemEl.appendChild(textEl);
        const pos = getItemPosition(i, 'text');
        items.push({
          el: itemEl,
          type: 'text',
          x: pos.x,
          y: pos.y,
          rot: pos.rot,
          baseZ: -i * CONFIG.zGap,
        });
      } else {
        const cardEl = document.createElement('div');
        cardEl.className = 'hyper-card';
        cardEl.innerHTML = `
          <div class="hyper-card-header">
            <span class="hyper-card-id">${entry.id}</span>
            <div class="hyper-card-chip"></div>
          </div>
          <p class="hyper-card-subtitle">${entry.subtitle}</p>
          <h2>${entry.title}</h2>
          <div class="hyper-card-copy">
            ${entry.lines.map((line) => `<p>${line}</p>`).join('')}
          </div>
          <div class="hyper-card-footer">
            <span>${entry.footer}</span>
            <span>MM-UI</span>
          </div>
          <div class="hyper-card-index">${String(i).padStart(2, '0')}</div>
        `;
        itemEl.appendChild(cardEl);
        const pos = getItemPosition(i, 'card');

        items.push({
          el: itemEl,
          type: 'card',
          x: pos.x,
          y: pos.y,
          rot: pos.rot,
          baseZ: -i * CONFIG.zGap,
        });
      }

      world.appendChild(itemEl);
    });

    for (let i = 0; i < CONFIG.starCount; i++) {
      const starEl = document.createElement('div');
      starEl.className = 'hyper-star';
      world.appendChild(starEl);
      items.push({
        el: starEl,
        type: 'star',
        x: (Math.random() - 0.5) * 3000,
        y: (Math.random() - 0.5) * 3000,
        rot: 0,
        baseZ: -Math.random() * CONFIG.loopSize,
      });
    }

    const onMouseMove = (event: MouseEvent) => {
      state.mouseX = (event.clientX / window.innerWidth - 0.5) * 2;
      state.mouseY = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove);

    const lenis = new Lenis({
      wrapper: root,
      content: scrollContent,
      smoothWheel: true,
      lerp: 0.08,
      duration: 1.2,
    });

    lenis.on('scroll', ({ scroll, velocity }: { scroll: number; velocity: number }) => {
      state.scroll = scroll;
      state.targetSpeed = velocity;
    });

    let animationId = 0;
    let lastTime = performance.now();
    let typingTimer = 0;
    const typingText = 'mirror mind';
    let typingIndex = 0;

    typingTimer = window.setInterval(() => {
      for (const typedEl of laptopTypedEls) {
        typedEl.textContent = typingText.slice(0, typingIndex);
      }
      typingIndex += 1;
      if (typingIndex > typingText.length) {
        for (const typedEl of laptopTypedEls) {
          typedEl.textContent = typingText;
        }
        window.clearInterval(typingTimer);
      }
    }, 140);

    const raf = (time: number) => {
      lenis.raf(time);

      const delta = time - lastTime;
      lastTime = time;
      if (delta > 0) fps.textContent = String(Math.round(1000 / delta));

      state.velocity += (state.targetSpeed - state.velocity) * 0.1;
      velReadout.textContent = Math.abs(state.velocity).toFixed(2);
      coord.textContent = state.scroll.toFixed(0);

      const tiltX = state.mouseY * 5 - state.velocity * 0.5;
      const tiltY = state.mouseX * 5;
      world.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;

      const baseFov = 1000;
      const fov = baseFov - Math.min(Math.abs(state.velocity) * 10, 600);
      viewport.style.perspective = `${fov}px`;

      const cameraZ = state.scroll * CONFIG.camSpeed;

      for (const item of items) {
        const relZ = item.baseZ + cameraZ;
        const modC = CONFIG.loopSize;
        let vizZ = ((relZ % modC) + modC) % modC;
        if (vizZ > 500) vizZ -= modC;

        let alpha = 1;
        if (vizZ < -3000) alpha = 0;
        else if (vizZ < -2000) alpha = (vizZ + 3000) / 1000;
        if (vizZ > 100 && item.type !== 'star') alpha = 1 - (vizZ - 100) / 400;
        if (alpha < 0) alpha = 0;

        item.el.style.opacity = String(alpha);
        if (alpha <= 0) continue;

        let transform = `translate3d(${item.x}px, ${item.y}px, ${vizZ}px)`;
        if (item.type === 'star') {
          const stretch = Math.max(1, Math.min(1 + Math.abs(state.velocity) * 0.1, 10));
          transform += ` scale3d(1, 1, ${stretch})`;
        } else if (item.type === 'text') {
          const offset = Math.abs(state.velocity) > 1 ? state.velocity * 2 : 0;
          item.el.style.textShadow = offset ? `${offset}px 0 #00b7ff, ${-offset}px 0 #4cc9ff` : 'none';
          transform += ` rotateZ(${item.rot}deg)`;
        } else if (item.type === 'laptop') {
          const pulse = 1 + Math.min(Math.abs(state.velocity) * 0.015, 0.08);
          transform += ` rotateX(${item.rot}deg) scale(${pulse})`;
        } else {
          const float = Math.sin(time * 0.001 + item.x) * 10;
          transform += ` rotateZ(${item.rot}deg) rotateY(${float}deg)`;
        }
        item.el.style.transform = transform;
      }

      animationId = requestAnimationFrame(raf);
    };

    animationId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(animationId);
      lenis.destroy();
      window.removeEventListener('mousemove', onMouseMove);
      window.clearInterval(typingTimer);
      world.innerHTML = '';
    };
  }, []);

  return (
    <div className="hyper-intro-root" ref={rootRef}>
      <div className="hyper-scroll-content" ref={scrollContentRef}>
        <div className="hyper-scanlines" />
        <div className="hyper-vignette" />
        <div className="hyper-noise" />

        <div className="hyper-hud">
          <div className="hyper-hud-top">
            <span>SYS.READY</span>
            <div className="hyper-hud-line" />
            <span>
              FPS: <strong ref={fpsRef}>60</strong>
            </span>
            <div className="hyper-hud-actions-top">
              {onLogout && (
                <button type="button" className="hyper-enter-button hyper-exit-button" onClick={onLogout}>
                  <LogOut size={14} />
                  Logout
                </button>
              )}
              <button
                type="button"
                className="hyper-enter-button"
                onClick={(e) => {
                  e.preventDefault();
                  onComplete();
                }}
              >
                <Play size={14} />
                Enter System
              </button>
            </div>
          </div>

          <div className="hyper-center-wrap">
            <div className="hyper-center-nav">
              SCROLL VELOCITY // <strong ref={velReadoutRef}>0.00</strong>
            </div>
          </div>

          <div className="hyper-hud-bottom">
            <span>
              COORD: <strong ref={coordRef}>000.000</strong>
            </span>
            <div className="hyper-hud-line" />
            <span>VER 2.0.4 [BETA]</span>
          </div>
        </div>

        <div className="hyper-viewport" ref={viewportRef}>
          <div className="hyper-world" ref={worldRef} />
        </div>
        <div className="hyper-scroll-proxy" />
      </div>
    </div>
  );
};
