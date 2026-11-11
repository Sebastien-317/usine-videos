import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  staticFile,
  delayRender,
  continueRender,
} from 'remotion';

export const FPS = 30;
const CL = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// Zone utile TikTok : on garde tout le contenu entre y≈260 et y≈1320, et loin du bord droit (icônes).
const Z = {entete: 262, haut: 490, sousTitres: 1290};

// ---------- Polices (fichiers locaux, aucun appel réseau au rendu) ----------
if (typeof window !== 'undefined') {
  const h = delayRender('polices');
  const anton = new FontFace('Anton', `url(${staticFile('fonts/Anton-Regular.ttf')})`);
  const mono = new FontFace('JBMono', `url(${staticFile('fonts/JetBrainsMono.ttf')})`, {weight: '100 800'});
  Promise.all([anton.load(), mono.load()])
    .then((fs) => {
      fs.forEach((f) => (document.fonts as any).add(f));
      continueRender(h);
    })
    .catch((e) => {
      console.error(e);
      continueRender(h);
    });
}

// ---------- Couches communes ----------
const Fond: React.FC<{c: any}> = ({c}) => {
  const f = useCurrentFrame();
  const gx = 540 + Math.sin(f / 70) * 240;
  const gy = 800 + Math.cos(f / 95) * 260;
  const masque = 'radial-gradient(ellipse 75% 55% at 50% 45%, black 25%, transparent 100%)';
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: `radial-gradient(820px 820px at ${gx}px ${gy}px, ${c.accent}24, transparent 70%)`}} />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${c.texte}10 2px, transparent 2px), linear-gradient(90deg, ${c.texte}10 2px, transparent 2px)`,
          backgroundSize: '90px 90px',
          backgroundPosition: `0px ${(f * 0.8) % 90}px`,
          maskImage: masque,
          WebkitMaskImage: masque,
        }}
      />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 85% 70% at 50% 45%, transparent 45%, rgba(0,0,0,0.7) 100%)'}} />
    </AbsoluteFill>
  );
};

const Grain: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{opacity: 0.09, mixBlendMode: 'overlay', pointerEvents: 'none'}}>
      <svg width="1080" height="1920">
        <filter id="g">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={f % 12} />
        </filter>
        <rect width="100%" height="100%" filter="url(#g)" />
      </svg>
    </AbsoluteFill>
  );
};

const Entete: React.FC<{story: any; c: any; progress: number}> = ({story, c, progress}) => {
  const f = useCurrentFrame();
  return (
    <>
      <div
        style={{
          position: 'absolute', top: Z.entete, left: 80, right: 80, display: 'flex', justifyContent: 'space-between',
          fontFamily: 'JBMono', fontWeight: 700, fontSize: 30, letterSpacing: 5, color: c.secondaire,
        }}
      >
        <span>
          <span style={{color: c.accent, opacity: Math.floor(f / 15) % 2 ? 1 : 0.35}}>●</span> {story.chaine.nom}
        </span>
        <span style={{color: c.texte}}>{story.rubrique}</span>
      </div>
      <div style={{position: 'absolute', top: Z.entete + 54, left: 80, width: 920, height: 6, borderRadius: 3, background: `${c.texte}22`}}>
        <div style={{width: `${progress * 100}%`, height: '100%', borderRadius: 3, background: c.accent}} />
      </div>
    </>
  );
};

// Sous-titres mot à mot, dans la bande du milieu (lisibles malgré l'interface TikTok)
const SousTitres: React.FC<{scenes: any[]; c: any; t: number}> = ({scenes, c, t}) => {
  const paquets: any[][] = [];
  for (const s of scenes) {
    let cur: any[] = [];
    s.mots.forEach((m: any, j: number) => {
      cur.push(m);
      if (cur.length >= 3 || /[.,!?:;]$/.test(m.mot) || j === s.mots.length - 1) {
        paquets.push(cur);
        cur = [];
      }
    });
  }
  const k = paquets.findIndex((p, i) => {
    const fin = i < paquets.length - 1 ? Math.min(paquets[i + 1][0].debut, p[p.length - 1].fin + 0.6) : p[p.length - 1].fin + 0.6;
    return t >= p[0].debut - 0.04 && t < fin - 0.04;
  });
  if (k < 0) return null;
  const p = paquets[k];
  const pop = interpolate(t - p[0].debut, [-0.04, 0.1], [0.82, 1], {...CL, easing: Easing.out(Easing.back(2.2))});
  return (
    <div style={{position: 'absolute', top: Z.sousTitres, left: 90, width: 840, display: 'flex', justifyContent: 'center'}}>
      <div
        style={{
          transform: `scale(${pop})`, fontWeight: 900, fontSize: 66, lineHeight: 1.12, textAlign: 'center',
          textShadow: '0 6px 22px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,1)',
        }}
      >
        {p.map((m: any, i: number) => (
          <span key={i} style={{color: t >= m.debut - 0.03 && t < m.fin + 0.03 ? c.accent : c.texte}}>
            {m.mot}
            {i < p.length - 1 ? ' ' : ''}
          </span>
        ))}
      </div>
    </div>
  );
};

// ---------- Gabarits de scènes ----------
const Mots: React.FC<{texte: string; debut: number; style: any; c: any}> = ({texte, debut, style, c}) => {
  const f = useCurrentFrame();
  return (
    <div style={style}>
      {texte.split(' ').map((m, i) => {
        const p = interpolate(f, [debut + i * 2.5, debut + i * 2.5 + 7], [0, 1], {...CL, easing: Easing.out(Easing.cubic)});
        const fort = /^\*.*\*[.,!?]?$/.test(m);
        return (
          <span key={i} style={{display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 28}px)`, marginRight: '0.26em', color: fort ? c.accent : undefined}}>
            {m.replace(/\*/g, '')}
          </span>
        );
      })}
    </div>
  );
};

const Source: React.FC<{s: any; c: any; top: number}> = ({s, c, top}) => {
  const f = useCurrentFrame();
  if (!s.source) return null;
  return (
    <div
      style={{
        position: 'absolute', top, left: 90, width: 900, textAlign: 'center', fontFamily: 'JBMono', fontWeight: 500,
        fontSize: 27, color: c.secondaire, opacity: interpolate(f, [20, 30], [0, 1], CL),
      }}
    >
      SOURCE : {s.source.toUpperCase()}
    </div>
  );
};

const Accroche: React.FC<{s: any; c: any}> = ({s, c}) => {
  const f = useCurrentFrame();
  const impact = spring({frame: f, fps: FPS, config: {damping: 9, stiffness: 190}});
  const echelle = interpolate(impact, [0, 1], [1.14, 1]);
  const sec = Math.max(0, 1 - f / 10);
  const dx = Math.sin(f * 2.7) * 14 * sec;
  const dy = Math.cos(f * 3.1) * 10 * sec;
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute', top: Z.haut, width: '100%', textAlign: 'center', fontFamily: 'Anton', fontSize: 470, lineHeight: 1.05,
          color: c.accent, transform: `translate(${dx}px, ${dy}px) scale(${echelle})`, textShadow: `0 0 90px ${c.accent}55`,
        }}
      >
        {s.grand}
      </div>
      <Mots
        texte={s.texte}
        debut={-20}
        c={c}
        style={{position: 'absolute', top: 1040, left: 90, width: 900, textAlign: 'center', fontWeight: 900, fontSize: 80, lineHeight: 1.08}}
      />
    </AbsoluteFill>
  );
};

const Chiffre: React.FC<{s: any; c: any}> = ({s, c}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [3, 28], [0, 1], {...CL, easing: Easing.out(Easing.cubic)});
  const val = Math.round(s.valeur * p);
  const pop = spring({frame: f - 28, fps: FPS, config: {damping: 10, stiffness: 210}});
  const echelle = f >= 28 ? interpolate(pop, [0, 1], [1.1, 1]) : 1;
  const tampon = spring({frame: f - 34, fps: FPS, config: {damping: 11, stiffness: 160}});
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute', top: Z.haut + 20, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'baseline',
          transform: `scale(${echelle})`,
        }}
      >
        <span style={{fontFamily: 'Anton', fontSize: 400, lineHeight: 1.05, color: c.accent, textShadow: `0 0 90px ${c.accent}44`}}>{val}</span>
        <span style={{fontFamily: 'Anton', fontSize: 180, color: c.texte, marginLeft: 8}}>{String(s.suffixe).trim()}</span>
      </div>
      {s.badge ? (
        <div
          style={{
            position: 'absolute', top: Z.haut - 10, left: 500, transform: `rotate(-8deg) scale(${interpolate(tampon, [0, 1], [2.4, 1])})`,
            opacity: interpolate(tampon, [0, 0.2], [0, 1], CL), border: `6px solid ${c.accent}`, color: c.accent, background: c.fond,
            fontFamily: 'JBMono', fontWeight: 800, fontSize: 38, letterSpacing: 3, padding: '10px 22px',
          }}
        >
          {s.badge}
        </div>
      ) : null}
      <Mots
        texte={s.texte}
        debut={12}
        c={c}
        style={{position: 'absolute', top: 995, left: 90, width: 900, textAlign: 'center', fontWeight: 800, fontSize: 64, lineHeight: 1.1}}
      />
      <Source s={s} c={c} top={1180} />
    </AbsoluteFill>
  );
};

const Frise: React.FC<{s: any; c: any}> = ({s, c}) => {
  const f = useCurrentFrame();
  const trace = interpolate(f, [2, 30], [0, 1], {...CL, easing: Easing.inOut(Easing.cubic)});
  const a = parseInt(s.debut, 10);
  const b = parseInt(s.fin, 10);
  const x0 = 170;
  const x1 = 880;
  const y = 920;
  const n = Math.round((b - a) * trace);
  const ticks = Array.from({length: b - a + 1}, (_, i) => i);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute', top: Z.haut + 10, width: '100%', textAlign: 'center', fontFamily: 'Anton', fontSize: 330, lineHeight: 1.05,
          color: c.accent, textShadow: `0 0 90px ${c.accent}44`,
        }}
      >
        {n} <span style={{color: c.texte, fontSize: 200}}>ANS</span>
      </div>
      <svg width="1080" height="1920" style={{position: 'absolute', top: 0, left: 0}}>
        <line x1={x0} y1={y} x2={x1} y2={y} stroke={`${c.texte}30`} strokeWidth={6} strokeLinecap="round" />
        <line x1={x0} y1={y} x2={x0 + (x1 - x0) * trace} y2={y} stroke={c.accent} strokeWidth={8} strokeLinecap="round" />
        {ticks.map((i) => {
          const x = x0 + ((x1 - x0) * i) / (b - a);
          const on = trace * (b - a) >= i;
          return <line key={i} x1={x} y1={y - 18} x2={x} y2={y + 18} stroke={on ? c.accent : `${c.texte}40`} strokeWidth={4} />;
        })}
        <circle cx={x0 + (x1 - x0) * trace} cy={y} r={20} fill={c.accent} />
        <circle cx={x0 + (x1 - x0) * trace} cy={y} r={44} fill={`${c.accent}33`} />
      </svg>
      <div style={{position: 'absolute', top: y + 40, left: x0 - 60, fontFamily: 'JBMono', fontWeight: 700, fontSize: 44, color: c.texte}}>{s.debut}</div>
      <div style={{position: 'absolute', top: y + 40, left: x1 - 120, fontFamily: 'JBMono', fontWeight: 700, fontSize: 44, color: trace > 0.98 ? c.accent : c.secondaire}}>
        {s.fin}
      </div>
      <Mots
        texte={s.texte}
        debut={22}
        c={c}
        style={{position: 'absolute', top: 1070, left: 90, width: 900, textAlign: 'center', fontWeight: 800, fontSize: 64, lineHeight: 1.1}}
      />
    </AbsoluteFill>
  );
};

const Relance: React.FC<{s: any; c: any; dur: number}> = ({s, c, dur}) => {
  const f = useCurrentFrame();
  const impact = spring({frame: f, fps: FPS, config: {damping: 10, stiffness: 170}});
  const cta = spring({frame: f - Math.round(dur * 0.6), fps: FPS, config: {damping: 9, stiffness: 160}});
  const pulse = 1 + 0.035 * Math.sin(f / 4) * (f > dur * 0.6 + 10 ? 1 : 0);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute', top: Z.haut, width: '100%', textAlign: 'center', fontFamily: 'Anton', fontSize: 380, lineHeight: 1.05,
          color: c.accent, transform: `scale(${interpolate(impact, [0, 1], [1.3, 1])})`, textShadow: `0 0 90px ${c.accent}55`,
        }}
      >
        {s.grand}
      </div>
      {s.lignes.map((l: string, i: number) => {
        const p = interpolate(f, [10 + i * 10, 20 + i * 10], [0, 1], {...CL, easing: Easing.out(Easing.cubic)});
        return (
          <div
            key={i}
            style={{
              position: 'absolute', top: 930 + i * 80, width: '100%', textAlign: 'center', fontWeight: i === 0 ? 900 : 700,
              fontSize: i === 0 ? 58 : 50, color: i === 0 ? c.texte : c.secondaire, opacity: p, transform: `translateY(${(1 - p) * 24}px)`,
            }}
          >
            {l}
          </div>
        );
      })}
      <div style={{position: 'absolute', top: 1120, width: '100%', display: 'flex', justifyContent: 'center'}}>
        <div
          style={{
            transform: `scale(${interpolate(cta, [0, 1], [0.4, 1]) * pulse})`, opacity: interpolate(cta, [0, 0.15], [0, 1], CL),
            background: c.accent, color: c.fond, fontWeight: 900, fontSize: 52, padding: '20px 46px', borderRadius: 999,
            boxShadow: `0 0 60px ${c.accent}66`,
          }}
        >
          + Abonne-toi
        </div>
      </div>
    </AbsoluteFill>
  );
};

const GABARITS: Record<string, React.FC<any>> = {accroche: Accroche, chiffre: Chiffre, frise: Frise, relance: Relance};

const Scene: React.FC<{s: any; c: any; dur: number; premiere: boolean}> = ({s, c, dur, premiere}) => {
  const f = useCurrentFrame();
  const entree = premiere ? 1 : interpolate(f, [0, 8], [0, 1], {...CL, easing: Easing.out(Easing.cubic)});
  const sortie = interpolate(f, [dur - 6, dur], [0, 1], CL);
  const flash = premiere ? 0 : interpolate(f, [0, 4], [0.22, 0], CL);
  const G = GABARITS[s.type];
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: entree * (1 - sortie),
          transform: `translateX(${(1 - entree) * 150}px) scale(${1 - sortie * 0.05})`,
          filter: `blur(${(1 - entree) * 10 + sortie * 8}px)`,
        }}
      >
        <G s={s} c={c} dur={dur} />
      </AbsoluteFill>
      <AbsoluteFill style={{background: c.accent, opacity: flash, mixBlendMode: 'screen'}} />
    </AbsoluteFill>
  );
};

export const Video: React.FC<{story: any; timing: any}> = ({story, timing}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  if (!story || !timing) return null;
  const c = story.chaine.couleurs;
  const scenes = story.scenes.map((s: any, i: number) => ({...s, mots: timing.scenes[i].mots, t0: timing.scenes[i].debut}));
  return (
    <AbsoluteFill style={{background: c.fond, fontFamily: 'Inter', color: c.texte, overflow: 'hidden'}}>
      <Fond c={c} />
      {scenes.map((s: any, i: number) => {
        const from = i === 0 ? 0 : Math.round(s.t0 * FPS);
        const to = i < scenes.length - 1 ? Math.round(scenes[i + 1].t0 * FPS) : durationInFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={to - from} layout="none">
            <Scene s={s} c={c} dur={to - from} premiere={i === 0} />
          </Sequence>
        );
      })}
      <Entete story={story} c={c} progress={frame / durationInFrames} />
      <SousTitres scenes={scenes} c={c} t={frame / FPS} />
      <Grain />
    </AbsoluteFill>
  );
};
