/**
 * Генерирует собственные демо-иллюстрации MOMENTA (векторная живопись → JPG) и иконки PWA.
 * Все изображения создаются кодом этого файла — сторонних материалов нет.
 * Запуск: npm run assets
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = join(root, 'public', 'demo');
const iconDir = join(root, 'public', 'icons');
mkdirSync(demoDir, { recursive: true });
mkdirSync(iconDir, { recursive: true });

const W = 1080;
const H = 1440;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const svg = (body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <filter id="b8" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="b20" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="20"/></filter>
  <filter id="b40" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>
  <filter id="b3"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.10"/></feComponentTransfer></filter>
  ${defs}
</defs>
${body}
<rect width="100%" height="100%" filter="url(#grain)"/>
</svg>`;

/** Горный хребет: сглаженная случайная ломаная. */
function ridge(r, y, amp, step, color, opacity = 1, jag = 1) {
  let pts = [];
  let h = y;
  for (let x = -40; x <= W + 40; x += step) {
    h += (r() - 0.5) * amp * jag;
    h = Math.max(y - amp * 1.6, Math.min(y + amp * 0.6, h));
    pts.push([x, h]);
  }
  let d = `M -40 ${H} L ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    d += ` Q ${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`;
  }
  d += ` L ${W + 40} ${H} Z`;
  return `<path d="${d}" fill="${color}" opacity="${opacity}"/>`;
}

function bokeh(r, n, area, colors, rMin, rMax, op = 0.5, blur = 'b8') {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = area[0] + r() * (area[2] - area[0]);
    const y = area[1] + r() * (area[3] - area[1]);
    const rad = rMin + r() * (rMax - rMin);
    const c = colors[Math.floor(r() * colors.length)];
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${c}" opacity="${(op * (0.5 + r() * 0.5)).toFixed(2)}" filter="url(#${blur})"/>`;
  }
  return s;
}

const scenes = {
  'mountains-dawn': () => {
    const r = rng(11);
    const defs = `
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#27325E"/><stop offset="0.38" stop-color="#7C6A9A"/>
        <stop offset="0.62" stop-color="#F0A985"/><stop offset="0.8" stop-color="#F9D8A4"/><stop offset="1" stop-color="#F3E5C7"/>
      </linearGradient>
      <radialGradient id="sun" cx="0.68" cy="0.5" r="0.4"><stop offset="0" stop-color="#FFF3D1" stop-opacity="1"/><stop offset="0.25" stop-color="#FFD49A" stop-opacity="0.7"/><stop offset="1" stop-color="#FFB27A" stop-opacity="0"/></radialGradient>`;
    let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/><rect width="${W}" height="${H}" fill="url(#sun)"/>`;
    b += `<circle cx="735" cy="720" r="46" fill="#FFF6DE" filter="url(#b8)"/>`;
    b += ridge(r, 760, 90, 60, '#9C8FB5', 0.75);
    b += `<rect x="0" y="760" width="${W}" height="90" fill="#F6E3CB" opacity="0.55" filter="url(#b20)"/>`;
    b += ridge(r, 860, 110, 50, '#6F6E99', 0.9);
    b += `<rect x="-50" y="900" width="${W + 100}" height="80" fill="#F2DCC4" opacity="0.5" filter="url(#b20)"/>`;
    b += ridge(r, 990, 120, 45, '#45507A');
    b += `<rect x="-50" y="1040" width="${W + 100}" height="70" fill="#E7D2C2" opacity="0.35" filter="url(#b20)"/>`;
    b += ridge(r, 1130, 110, 40, '#2A3352');
    b += ridge(r, 1290, 70, 35, '#18203A');
    // Ели на ближнем склоне справа — детали справа.
    for (let i = 0; i < 26; i++) {
      const x = 640 + r() * 420;
      const y = 1230 + r() * 120;
      const h = 60 + r() * 90;
      b += `<path d="M ${x} ${y - h} L ${x - h * 0.22} ${y} L ${x + h * 0.22} ${y} Z" fill="#101629"/>`;
    }
    return svg(b, defs);
  },
  'lake-turquoise': () => {
    const r = rng(21);
    const defs = `
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FB2D6"/><stop offset="1" stop-color="#D9ECF2"/></linearGradient>
      <linearGradient id="lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4CC6C0"/><stop offset="0.5" stop-color="#2A9AA3"/><stop offset="1" stop-color="#175E6E"/></linearGradient>`;
    let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
    b += bokeh(r, 7, [0, 80, W, 420], ['#FFFFFF'], 60, 140, 0.55, 'b40');
    b += ridge(r, 560, 160, 70, '#8C9DB4', 0.9, 1.4);
    b += ridge(r, 650, 120, 60, '#5D7488', 1, 1.2);
    b += ridge(r, 720, 60, 50, '#3F6B4E');
    b += `<rect x="0" y="760" width="${W}" height="${H - 760}" fill="url(#lake)"/>`;
    for (let i = 0; i < 70; i++) {
      const y = 780 + r() * 520;
      const x = r() * W;
      const w = 40 + r() * 220;
      b += `<rect x="${x}" y="${y}" width="${w}" height="${2 + r() * 3}" fill="#E6FBF8" opacity="${0.15 + r() * 0.3}" rx="2"/>`;
    }
    b += `<path d="M0 1250 Q 180 1160 360 1230 T 640 1300 L 640 ${H} L 0 ${H} Z" fill="#5B4A3A"/>`;
    b += `<path d="M0 1320 Q 220 1260 420 1330 T 700 1440 L 0 1440 Z" fill="#3E3328"/>`;
    b += bokeh(r, 30, [0, 1260, 600, 1440], ['#7A8B4A', '#9AA65A'], 6, 16, 0.7, 'b3');
    return svg(b, defs);
  },
  'tea-thermos': () => {
    const r = rng(31);
    const defs = `
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E8B98C"/><stop offset="0.55" stop-color="#9E7C77"/><stop offset="1" stop-color="#4A3A35"/></linearGradient>
      <linearGradient id="mug" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7E2A1E"/><stop offset="0.35" stop-color="#C4503A"/><stop offset="0.7" stop-color="#A33D2B"/><stop offset="1" stop-color="#5C1E15"/></linearGradient>
      <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5D646E"/><stop offset="0.3" stop-color="#D9DEE4"/><stop offset="0.55" stop-color="#8E959F"/><stop offset="1" stop-color="#3A3F46"/></linearGradient>
      <radialGradient id="tea" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#C98A3C"/><stop offset="1" stop-color="#6B3A15"/></radialGradient>`;
    let b = `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;
    b += bokeh(r, 16, [0, 0, W, 700], ['#FFE2B0', '#F7C98F', '#FFFFFF'], 40, 110, 0.45, 'b20');
    b += `<rect x="0" y="980" width="${W}" height="460" fill="#5E4A3E"/>`;
    b += bokeh(r, 120, [0, 990, W, 1440], ['#7A6252', '#4A3A30', '#8E7563'], 4, 18, 0.8, 'b3');
    // Термос слева
    b += `<rect x="120" y="440" width="190" height="620" rx="34" fill="url(#steel)"/><rect x="140" y="390" width="150" height="80" rx="18" fill="#2B2F35"/>`;
    // Кружка справа — главный объект
    b += `<ellipse cx="660" cy="1080" rx="250" ry="40" fill="#2A1E19" opacity="0.6" filter="url(#b8)"/>`;
    b += `<path d="M450 700 L 450 1040 Q 450 1090 640 1090 Q 830 1090 830 1040 L 830 700 Z" fill="url(#mug)"/>`;
    b += `<path d="M830 780 q 120 0 120 110 q 0 110 -120 110" fill="none" stroke="#9C3826" stroke-width="34"/>`;
    b += `<ellipse cx="640" cy="700" rx="190" ry="42" fill="#F3EEE6"/><ellipse cx="640" cy="706" rx="168" ry="32" fill="url(#tea)"/>`;
    b += `<ellipse cx="600" cy="700" rx="60" ry="9" fill="#F5CF8F" opacity="0.6"/>`;
    for (let i = 0; i < 3; i++) {
      const x = 560 + i * 70;
      b += `<path d="M${x} 660 C ${x - 40} 600 ${x + 40} 560 ${x} 500 C ${x - 40} 450 ${x + 30} 410 ${x} 360" fill="none" stroke="#FFFFFF" stroke-width="16" opacity="0.32" filter="url(#b8)"/>`;
    }
    return svg(b, defs);
  },
  'stage-lights': () => {
    const r = rng(41);
    const defs = `
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B0618"/><stop offset="0.6" stop-color="#1A0B2E"/><stop offset="1" stop-color="#05030B"/></linearGradient>
      <linearGradient id="beamM" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF4FB0" stop-opacity="0.95"/><stop offset="1" stop-color="#FF4FB0" stop-opacity="0"/></linearGradient>
      <linearGradient id="beamC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4FE3FF" stop-opacity="0.95"/><stop offset="1" stop-color="#4FE3FF" stop-opacity="0"/></linearGradient>
      <linearGradient id="beamV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9C6BFF" stop-opacity="0.9"/><stop offset="1" stop-color="#9C6BFF" stop-opacity="0"/></linearGradient>
      <filter id="smoke"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="3" seed="9"/><feColorMatrix type="matrix" values="0 0 0 0 0.75  0 0 0 0 0.6  0 0 0 0 1  0 0 0 0.55 0"/></filter>`;
    let b = `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;
    b += `<rect width="${W}" height="${H}" filter="url(#smoke)" opacity="0.55"/>`;
    const beams = [[150, 'beamM', 380], [330, 'beamC', 620], [540, 'beamV', 520], [760, 'beamM', 430], [930, 'beamC', 700]];
    for (const [x, g, tx] of beams) {
      b += `<path d="M ${x - 14} 90 L ${x + 14} 90 L ${tx + 210} 1300 L ${tx - 210} 1300 Z" fill="url(#${g})" opacity="0.55" filter="url(#b8)"/>`;
      b += `<circle cx="${x}" cy="92" r="26" fill="#FFFFFF" filter="url(#b8)"/>`;
      b += `<circle cx="${x}" cy="92" r="60" fill="${g === 'beamC' ? '#4FE3FF' : g === 'beamM' ? '#FF4FB0' : '#9C6BFF'}" opacity="0.6" filter="url(#b20)"/>`;
    }
    b += `<rect x="0" y="1060" width="${W}" height="30" fill="#2B1840"/>`;
    // Силуэт музыканта
    b += `<path d="M520 1060 L 530 900 Q 540 840 580 830 Q 560 800 572 770 Q 590 740 615 760 Q 630 790 610 830 Q 650 845 660 900 L 672 1060 Z" fill="#05030B"/>`;
    b += `<path d="M575 920 L 720 860 L 728 874 L 585 940 Z" fill="#05030B"/>`;
    // Головы зрителей
    for (let i = 0; i < 26; i++) {
      const x = i * 44 + r() * 20;
      const y = 1230 + r() * 60;
      b += `<circle cx="${x}" cy="${y}" r="${34 + r() * 10}" fill="#04020A"/><rect x="${x - 50}" y="${y + 20}" width="100" height="300" fill="#04020A"/>`;
    }
    b += bokeh(r, 30, [0, 0, W, 900], ['#FF4FB0', '#4FE3FF', '#FFFFFF'], 3, 8, 0.8, 'b3');
    return svg(b, defs);
  },
  'crowd-hands': () => {
    const r = rng(51);
    const defs = `
      <radialGradient id="glow" cx="0.5" cy="0.35" r="0.7"><stop offset="0" stop-color="#FFB36B"/><stop offset="0.35" stop-color="#E2457E"/><stop offset="0.75" stop-color="#3B1658"/><stop offset="1" stop-color="#0D0618"/></radialGradient>`;
    let b = `<rect width="${W}" height="${H}" fill="url(#glow)"/>`;
    b += bokeh(r, 40, [0, 0, W, 900], ['#FFD39A', '#FF6FAE', '#7BE7FF', '#FFFFFF'], 20, 70, 0.55, 'b20');
    // Поднятые руки
    for (let i = 0; i < 9; i++) {
      const x = 60 + i * 120 + r() * 40;
      const top = 620 + r() * 320;
      const lean = (r() - 0.5) * 140;
      b += `<path d="M ${x - 26} ${H} L ${x + lean - 18} ${top + 120} L ${x + lean + 18} ${top + 120} L ${x + 30} ${H} Z" fill="#0A0512"/>`;
      b += `<ellipse cx="${x + lean}" cy="${top + 80}" rx="34" ry="52" fill="#0A0512"/>`;
      for (let f = 0; f < 4; f++) b += `<rect x="${x + lean - 30 + f * 16}" y="${top - 10 + Math.abs(f - 1.5) * 12}" width="12" height="80" rx="6" fill="#0A0512"/>`;
    }
    for (let i = 0; i < 90; i++) {
      const x = r() * W;
      const y = r() * 1000;
      b += `<rect x="${x}" y="${y}" width="${6 + r() * 8}" height="${3 + r() * 4}" fill="${['#FFE08A', '#FF7FB8', '#8FF0FF'][i % 3]}" transform="rotate(${r() * 180} ${x} ${y})" opacity="0.85"/>`;
    }
    return svg(b, defs);
  },
  'rain-window': () => {
    const r = rng(61);
    const defs = `
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0E1A2B"/><stop offset="0.6" stop-color="#1D2B40"/><stop offset="1" stop-color="#2B2A33"/></linearGradient>`;
    let b = `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;
    // Огни улицы — больше справа
    b += bokeh(r, 24, [380, 200, W, 1300], ['#F4B860', '#E9805A', '#F7D79A', '#6FC3C8'], 40, 110, 0.75, 'b20');
    b += bokeh(r, 10, [0, 300, 400, 1300], ['#F4B860', '#6FC3C8'], 30, 70, 0.35, 'b20');
    b += `<rect x="-60" y="1200" width="${W + 120}" height="320" fill="#0C1320" opacity="0.6" filter="url(#b40)"/>`;
    // Капли и дорожки
    for (let i = 0; i < 260; i++) {
      const x = r() * W;
      const y = r() * H;
      const rad = 2 + r() * 7;
      b += `<circle cx="${x}" cy="${y}" r="${rad}" fill="#CFE3F2" opacity="${0.18 + r() * 0.25}"/><circle cx="${x - rad * 0.3}" cy="${y - rad * 0.3}" r="${rad * 0.35}" fill="#FFFFFF" opacity="0.5"/>`;
    }
    for (let i = 0; i < 26; i++) {
      const x = r() * W;
      const y = r() * 900;
      const l = 120 + r() * 380;
      b += `<path d="M ${x} ${y} q ${(r() - 0.5) * 20} ${l / 2} ${(r() - 0.5) * 16} ${l}" stroke="#D8EAF6" stroke-width="${2 + r() * 3}" opacity="0.35" fill="none"/>`;
    }
    // Оконная рама слева
    b += `<rect x="0" y="0" width="70" height="${H}" fill="#2C1E17"/><rect x="70" y="0" width="12" height="${H}" fill="#4A3426"/>`;
    return svg(b, defs);
  },
  'cup-lamp': () => {
    const r = rng(71);
    const defs = `
      <radialGradient id="lamp" cx="0.22" cy="0.12" r="0.85"><stop offset="0" stop-color="#FFE0A3"/><stop offset="0.3" stop-color="#C9853F"/><stop offset="0.7" stop-color="#4A2C1C"/><stop offset="1" stop-color="#1E140F"/></radialGradient>
      <linearGradient id="table" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6B4428"/><stop offset="1" stop-color="#2E1C12"/></linearGradient>
      <radialGradient id="tea" cx="0.45" cy="0.45" r="0.55"><stop offset="0" stop-color="#E7A24B"/><stop offset="1" stop-color="#7A3E12"/></radialGradient>
      <linearGradient id="cup" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#CFC6BB"/><stop offset="0.35" stop-color="#F8F3EC"/><stop offset="1" stop-color="#A89D92"/></linearGradient>`;
    let b = `<rect width="${W}" height="${H}" fill="url(#lamp)"/>`;
    // Окно с дождём справа
    b += `<rect x="640" y="120" width="380" height="660" rx="10" fill="#1B2A3C"/>`;
    b += bokeh(r, 12, [660, 140, 1000, 760], ['#6FA6C8', '#F2B866'], 20, 50, 0.6, 'b8');
    for (let i = 0; i < 60; i++) b += `<circle cx="${660 + r() * 340}" cy="${140 + r() * 620}" r="${2 + r() * 4}" fill="#D6E7F3" opacity="0.4"/>`;
    b += `<rect x="636" y="116" width="388" height="668" rx="12" fill="none" stroke="#3A2618" stroke-width="16"/>`;
    // Абажур
    b += `<path d="M60 0 L 380 0 L 440 210 L 0 210 Z" fill="#E9B46A" opacity="0.95"/><ellipse cx="220" cy="210" rx="220" ry="26" fill="#FFE7B5"/>`;
    b += `<circle cx="220" cy="300" r="260" fill="#FFD48A" opacity="0.25" filter="url(#b40)"/>`;
    // Стол, чашка, блюдце
    b += `<rect x="0" y="960" width="${W}" height="480" fill="url(#table)"/>`;
    for (let i = 0; i < 14; i++) b += `<path d="M0 ${990 + i * 32} Q ${W / 2} ${980 + i * 32 + (r() - 0.5) * 20} ${W} ${995 + i * 32}" stroke="#4A2E1C" stroke-width="2" opacity="0.5" fill="none"/>`;
    b += `<ellipse cx="470" cy="1190" rx="300" ry="70" fill="#E9E1D6"/><ellipse cx="470" cy="1180" rx="250" ry="52" fill="#D4CABD"/>`;
    b += `<path d="M300 900 L 320 1150 Q 470 1210 620 1150 L 640 900 Z" fill="url(#cup)"/>`;
    b += `<path d="M636 960 q 110 10 100 95 q -10 80 -110 80" fill="none" stroke="#E6DED3" stroke-width="26"/>`;
    b += `<ellipse cx="470" cy="900" rx="170" ry="38" fill="#F3EDE4"/><ellipse cx="470" cy="905" rx="150" ry="28" fill="url(#tea)"/>`;
    for (let i = 0; i < 3; i++) {
      const x = 420 + i * 50;
      b += `<path d="M${x} 870 C ${x - 30} 820 ${x + 30} 780 ${x} 720 C ${x - 30} 680 ${x + 20} 640 ${x} 600" fill="none" stroke="#FFF3DE" stroke-width="12" opacity="0.3" filter="url(#b8)"/>`;
    }
    b += `<path d="M760 1120 l 70 -10 l 10 30 l -70 12 Z" fill="#8A5A2B"/><circle cx="860" cy="1110" r="16" fill="#6E3F1C"/>`;
    return svg(b, defs);
  },
  'baikal-ice': () => {
    const r = rng(81);
    const defs = `
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9EC3E6"/><stop offset="1" stop-color="#EAF3FA"/></linearGradient>
      <linearGradient id="ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B9E3EC"/><stop offset="0.5" stop-color="#5FB3C9"/><stop offset="1" stop-color="#2D7894"/></linearGradient>`;
    let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
    b += `<circle cx="300" cy="380" r="70" fill="#FFFFFF" opacity="0.9" filter="url(#b20)"/>`;
    b += ridge(r, 640, 70, 70, '#8EA4BE', 0.9);
    b += ridge(r, 690, 40, 60, '#C9D6E2');
    b += `<rect x="0" y="700" width="${W}" height="${H - 700}" fill="url(#ice)"/>`;
    for (let i = 0; i < 40; i++) {
      let x = r() * W;
      let y = 720 + r() * 700;
      let d = `M ${x} ${y}`;
      for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 160; y += (r() - 0.3) * 60; d += ` L ${x} ${y}`; }
      b += `<path d="${d}" stroke="#F2FBFF" stroke-width="${1 + r() * 2.5}" opacity="0.7" fill="none"/>`;
    }
    b += bokeh(r, 40, [0, 700, W, 1440], ['#FFFFFF', '#D8F2FA'], 2, 6, 0.9, 'b3');
    return svg(b, defs);
  },
  'birthday-candles': () => {
    const r = rng(91);
    const defs = `
      <radialGradient id="bg" cx="0.5" cy="0.55" r="0.75"><stop offset="0" stop-color="#5A2E25"/><stop offset="0.6" stop-color="#2A1418"/><stop offset="1" stop-color="#120A0E"/></radialGradient>
      <linearGradient id="cake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6E1D3"/><stop offset="1" stop-color="#D9A8A0"/></linearGradient>`;
    let b = `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;
    b += bokeh(r, 30, [0, 0, W, 600], ['#FFC870', '#FF9E7A', '#FFF0C8'], 20, 50, 0.6, 'b8');
    b += `<ellipse cx="540" cy="1180" rx="380" ry="80" fill="#3A1E1A"/>`;
    b += `<path d="M200 840 L 200 1160 Q 540 1240 880 1160 L 880 840 Z" fill="url(#cake)"/>`;
    b += `<ellipse cx="540" cy="840" rx="340" ry="70" fill="#FBEFE6"/>`;
    for (let i = 0; i < 7; i++) b += `<path d="M ${230 + i * 95} 860 q 20 60 0 90" stroke="#E07A8A" stroke-width="16" fill="none" stroke-linecap="round"/>`;
    for (let i = 0; i < 5; i++) {
      const x = 330 + i * 105;
      const y = 820 + Math.abs(i - 2) * 8;
      b += `<rect x="${x - 11}" y="${y - 150}" width="22" height="150" rx="6" fill="${['#9FC7E8', '#F2B6C6', '#F6D88B'][i % 3]}"/>`;
      b += `<circle cx="${x}" cy="${y - 190}" r="70" fill="#FFC26B" opacity="0.35" filter="url(#b20)"/>`;
      b += `<path d="M ${x} ${y - 225} Q ${x + 18} ${y - 185} ${x} ${y - 158} Q ${x - 18} ${y - 185} ${x} ${y - 225} Z" fill="#FFE7A8"/>`;
    }
    return svg(b, defs);
  },
};

for (const [name, fn] of Object.entries(scenes)) {
  await sharp(Buffer.from(fn())).jpeg({ quality: 84, mozjpeg: true }).toFile(join(demoDir, `${name}.jpg`));
  console.log('demo', name);
}

// ---------- Знак MOMENTA ----------
const mark = (bg, pad) => {
  const s = 48 - pad * 2;
  const k = s / 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="512" height="512">
${bg ? `<rect width="48" height="48" fill="#101827"/>` : ''}
<g transform="translate(${pad} ${pad}) scale(${k})">
  <rect x="6" y="9" width="24" height="24" rx="5.5" fill="none" stroke="#AAB8CB" stroke-width="3"/>
  <rect x="17" y="15" width="25" height="25" rx="5.5" fill="#1C2A40" stroke="#91A9D1" stroke-width="3"/>
  <path d="M21.5 29.5 C24 24.5 26.5 24.5 29.5 29.5 S35 34.5 37.5 29.5" fill="none" stroke="#EDF2FA" stroke-width="2.6" stroke-linecap="round"/>
</g>
</svg>`;
};
writeFileSync(join(root, 'public', 'favicon.svg'), mark(true, 2).replace('width="512" height="512"', ''));
await sharp(Buffer.from(mark(true, 3))).resize(192, 192).png().toFile(join(iconDir, 'icon-192.png'));
await sharp(Buffer.from(mark(true, 3))).resize(512, 512).png().toFile(join(iconDir, 'icon-512.png'));
await sharp(Buffer.from(mark(true, 9))).resize(512, 512).png().toFile(join(iconDir, 'icon-maskable-512.png'));
console.log('icons ok');
