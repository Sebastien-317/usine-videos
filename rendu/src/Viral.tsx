import React, {useLayoutEffect, useRef} from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, staticFile, delayRender, continueRender} from 'remotion';
import {creerMonde, tramer, RW, RH, MondeRendu} from './monde';

export const FPS = 30;
const CL = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const JAUNE = '#FFE14D';
const ROUGE = '#FF3B3B';

if (typeof window !== 'undefined') {
  const h = delayRender('polices-viral');
  const anton = new FontFace('Anton', `url(${staticFile('fonts/Anton-Regular.ttf')})`);
  anton.load().then((f) => { (document.fonts as any).add(f); continueRender(h); }).catch(() => continueRender(h));
}

// Texte « réseaux sociaux » : gros contour noir + ombre portée dure
const contour = (px: number) => ({WebkitTextStroke: `${px}px #000`, paintOrder: 'stroke fill', textShadow: `0 ${px * 0.9}px 0 #000`} as any);

// ---------- 3D pixelisée ----------
const Plan3D: React.FC<{plan: string; seed: number; dur: number}> = ({plan, seed, dur}) => {
  const f = useCurrentFrame();
  const gl = useRef<HTMLCanvasElement>(null);
  const out = useRef<HTMLCanvasElement>(null);
  const monde = useRef<MondeRendu | null>(null);
  useLayoutEffect(() => () => { monde.current?.dispose(); monde.current = null; }, []);
  useLayoutEffect(() => {
    if (!monde.current) monde.current = creerMonde(plan, seed, dur / FPS, gl.current!);
    monde.current.render(f / FPS);
    tramer(gl.current!, out.current!, 12);
  }, [f]);
  const punch = interpolate(f, [0, 6], [1.14, 1], {...CL, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{transform: `scale(${punch})`}}>
      <canvas ref={gl} width={RW} height={RH} style={{display: 'none'}} />
      <canvas ref={out} width={RW} height={RH} style={{position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, imageRendering: 'pixelated'}} />
    </AbsoluteFill>
  );
};

// ---------- Textes ----------
const Gros: React.FC<{texte: string; top: number; debut?: number; ecart?: number}> = ({texte, top, debut = 0, ecart = 3}) => {
  const f = useCurrentFrame();
  const lignes = texte.split('|');
  const plusLongue = Math.max(...lignes.map((l) => l.length));
  const taille = Math.min(300, 960 / (0.47 * plusLongue));
  let n = 0;
  return (
    <div style={{position: 'absolute', top, left: 40, width: 1000, textAlign: 'center', transform: `rotate(-3deg) scale(${debut < -20 ? 1 + 0.035 * Math.abs(Math.sin(f / 4)) : 1})`}}>
      {lignes.map((l, li) => (
        <div key={li} style={{fontFamily: 'Anton', fontSize: taille, lineHeight: 1.02, color: li % 2 ? '#fff' : JAUNE, ...contour(taille * 0.06)}}>
          {l.split(' ').map((m, i) => {
            const k = n++;
            const sp = spring({frame: f - debut - k * ecart, fps: FPS, config: {damping: 9, stiffness: 220}});
            return (
              <span key={i} style={{display: 'inline-block', transform: `scale(${Math.max(0.9, interpolate(sp, [0, 1], [2.2, 1]))})`, opacity: interpolate(sp, [0, 0.1], [0, 1], CL), margin: '0 0.12em'}}>
                {m}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const Compteur: React.FC<{c: any; top: number}> = ({c, top}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [2, 20], [0, 1], {...CL, easing: Easing.out(Easing.cubic)});
  const v = c.valeur * p;
  const txt = Number.isInteger(c.valeur) ? Math.round(v).toString() : v.toFixed(1).replace('.', ',');
  const pop = spring({frame: f - 20, fps: FPS, config: {damping: 8, stiffness: 240}});
  const lab = spring({frame: f - 8, fps: FPS, config: {damping: 12, stiffness: 200}});
  return (
    <div style={{position: 'absolute', top, left: 0, width: 1080, textAlign: 'center'}}>
      <div style={{transform: `rotate(-3deg) scale(${f >= 20 ? interpolate(pop, [0, 1], [1.18, 1]) : 1})`}}>
        <span style={{fontFamily: 'Anton', fontSize: 290, lineHeight: 1, color: JAUNE, ...contour(16)}}>{(c.prefixe || '') + txt}</span>
        <span style={{fontFamily: 'Anton', fontSize: 170, color: '#fff', ...contour(12)}}>{c.suffixe || ''}</span>
      </div>
      {c.label ? (
        <div style={{marginTop: 18, fontFamily: 'Inter', fontWeight: 900, fontSize: 62, color: '#fff', lineHeight: 1.1, opacity: interpolate(lab, [0, 0.2], [0, 1], CL), transform: `translateY(${(1 - lab) * 40}px)`, ...contour(10)}}>
          {c.label}
        </div>
      ) : null}
    </div>
  );
};

const Tampon: React.FC<{texte: string; a: number; top: number}> = ({texte, a, top}) => {
  const f = useCurrentFrame();
  const sp = spring({frame: f - a, fps: FPS, config: {damping: 14, stiffness: 200}});
  if (f < a) return null;
  return (
    <div style={{position: 'absolute', top, left: 0, width: 1080, display: 'flex', justifyContent: 'center'}}>
      <div style={{transform: `rotate(-7deg) scale(${Math.max(0.95, interpolate(sp, [0, 1], [3, 1]))})`, opacity: interpolate(sp, [0, 0.15], [0, 1], CL), background: ROUGE, color: '#fff', fontFamily: 'Anton', fontSize: 92, padding: '6px 34px', border: '8px solid #fff', boxShadow: '0 12px 0 #000', letterSpacing: 2}}>
        {texte}
      </div>
    </div>
  );
};

const Question: React.FC<{q: any; top: number; dur: number}> = ({q, top, dur}) => {
  const f = useCurrentFrame();
  const a = Math.round(dur * 0.35);
  const sp = spring({frame: f - a, fps: FPS, config: {damping: 9, stiffness: 170}});
  const pulse = 1 + 0.04 * Math.sin(f / 3.5);
  return (
    <>
      <Gros texte={q.texte} top={top} />
      <div style={{position: 'absolute', top: top + 420, left: 0, width: 1080, display: 'flex', justifyContent: 'center', opacity: f >= a ? 1 : 0}}>
        <div style={{transform: `scale(${interpolate(sp, [0, 1], [0.3, 1]) * pulse})`, position: 'relative', background: '#fff', color: '#000', fontFamily: 'Inter', fontWeight: 900, fontSize: 52, padding: '22px 40px', borderRadius: 40, border: '6px solid #000', boxShadow: '0 10px 0 #000'}}>
          {q.bulle}
          <div style={{position: 'absolute', bottom: -34, left: 70, width: 0, height: 0, borderLeft: '22px solid transparent', borderRight: '22px solid transparent', borderTop: '34px solid #000'}} />
        </div>
      </div>
    </>
  );
};

// Sous-titres façon TikTok : 1 à 3 mots, mot en cours en jaune
const SousTitres: React.FC<{scenes: any[]; t: number}> = ({scenes, t}) => {
  const paquets: any[][] = [];
  for (const s of scenes) {
    let cur: any[] = [];
    s.mots.forEach((m: any, j: number) => {
      cur.push(m);
      if (cur.length >= 3 || /[.,!?:;…]$/.test(m.mot) || j === s.mots.length - 1) {
        paquets.push(cur);
        cur = [];
      }
    });
  }
  const k = paquets.findIndex((p, i) => {
    const fin = i < paquets.length - 1 ? Math.min(paquets[i + 1][0].debut, p[p.length - 1].fin + 0.5) : p[p.length - 1].fin + 0.5;
    return t >= p[0].debut - 0.04 && t < fin - 0.04;
  });
  if (k < 0) return null;
  const p = paquets[k];
  const pop = interpolate(t - p[0].debut, [-0.04, 0.09], [0.7, 1], {...CL, easing: Easing.out(Easing.back(2.5))});
  return (
    <div style={{position: 'absolute', top: 1330, left: 70, width: 940, display: 'flex', justifyContent: 'center'}}>
      <div style={{transform: `scale(${pop})`, fontFamily: 'Inter', fontWeight: 900, fontSize: 70, lineHeight: 1.1, textAlign: 'center', textTransform: 'uppercase', ...contour(13)}}>
        {p.map((m: any, i: number) => {
          const actif = t >= m.debut - 0.03 && t < m.fin + 0.03;
          return (
            <React.Fragment key={i}>
              <span style={{color: actif ? JAUNE : '#fff', display: 'inline-block', margin: '0 0.2em'}}>{m.mot.replace(/[,;]$/, '')}</span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ---------- Scène ----------
const Scene: React.FC<{s: any; dur: number; idx: number}> = ({s, dur, idx}) => {
  const f = useCurrentFrame();
  const push = interpolate(f, [0, dur], [1, 1.08]);
  const flash = idx === 0 ? 0 : interpolate(f, [0, 3], [0.9, 0], CL);
  const sec = idx > 0 && f < 6 ? (f % 2 ? 14 : -14) * (1 - f / 6) : 0;
  const plans: string[] = s.plans;
  const part = Math.floor(dur / plans.length);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{transform: `translate(${sec}px, ${-sec * 0.5}px) scale(${push})`}}>
        {plans.map((p, k) => (
          <Sequence key={k} from={k * part} durationInFrames={k === plans.length - 1 ? dur - k * part : part} layout="none">
            <Plan3D plan={p} seed={s.seed + k * 17} dur={k === plans.length - 1 ? dur - k * part : part} />
          </Sequence>
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%)'}} />
      {s.gros || s.compteur || s.question ? <AbsoluteFill style={{background: 'radial-gradient(ellipse 62% 20% at 50% 37%, rgba(0,0,0,0.5), rgba(0,0,0,0) 75%)'}} /> : null}
      {s.gros ? <Gros texte={s.gros} top={560} debut={idx === 0 ? -40 : 0} ecart={idx === 0 ? 1 : 3} /> : null}
      {s.compteur ? <Compteur c={s.compteur} top={540} /> : null}
      {s.tampon ? <Tampon texte={s.tampon} a={Math.round((s.tamponA ?? 1) * FPS)} top={1060} /> : null}
      {s.question ? <Question q={s.question} top={520} dur={dur} /> : null}
      <AbsoluteFill style={{background: '#fff', opacity: flash}} />
    </AbsoluteFill>
  );
};

export const Viral: React.FC<{story: any; timing: any}> = ({story, timing}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  if (!story || !timing) return null;
  const scenes = story.scenes.map((s: any, i: number) => ({...s, mots: timing.scenes[i].mots, t0: timing.scenes[i].debut}));
  return (
    <AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
      {scenes.map((s: any, i: number) => {
        const from = i === 0 ? 0 : Math.round(s.t0 * FPS);
        const to = i < scenes.length - 1 ? Math.round(scenes[i + 1].t0 * FPS) : durationInFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={to - from} layout="none">
            <Scene s={s} dur={to - from} idx={i} />
          </Sequence>
        );
      })}
      <AbsoluteFill style={{background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.13) 0px, rgba(0,0,0,0.13) 2px, transparent 2px, transparent 4px)', pointerEvents: 'none'}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 65% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)'}} />
      <SousTitres scenes={scenes} t={frame / FPS} />
      <div style={{position: 'absolute', top: 236, left: 60, width: 960, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.25)'}}>
        <div style={{width: `${(frame / durationInFrames) * 100}%`, height: '100%', borderRadius: 5, background: JAUNE}} />
      </div>
    </AbsoluteFill>
  );
};
