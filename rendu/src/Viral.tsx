import React, {useLayoutEffect, useRef} from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, staticFile, delayRender, continueRender} from 'remotion';
import {rendreMonde, tramer, RW, RH} from './monde';

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
export const Plan3D: React.FC<{plan: string; seed: number; dur: number; decal?: number; zoom?: number; incl?: number}> = ({plan, seed, dur, decal = 0, zoom = 1, incl = 0}) => {
  const f = useCurrentFrame();
  const out = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    tramer(rendreMonde(plan, seed, dur / FPS + decal, f / FPS + decal), out.current!, 12);
  }, [f]);
  const punch = interpolate(f, [0, 5], [zoom * 1.12, zoom], {...CL, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{transform: `scale(${punch}) rotate(${incl}deg)`}}>
      <canvas ref={out} width={RW} height={RH} style={{position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, imageRendering: 'pixelated'}} />
    </AbsoluteFill>
  );
};

// Montage nerveux : une coupe toutes les ~1,6 s (autre plan, autre angle, autre cadrage)
const SEG = Math.round(1.6 * 30);
const Fond: React.FC<{plans: string[]; seed: number; dur: number}> = ({plans, seed, dur}) => {
  const n = Math.max(1, Math.round(dur / SEG));
  const part = Math.floor(dur / n);
  return (
    <>
      {Array.from({length: n}, (_, k) => {
        const d = k === n - 1 ? dur - k * part : part;
        return (
          <Sequence key={k} from={k * part} durationInFrames={d} layout="none">
            <Plan3D plan={plans[k % plans.length]} seed={seed + (k % plans.length) * 17} dur={d} decal={(k * 1.9) % 5.5}
              zoom={k % 2 ? 1.18 : 1} incl={k % 2 ? (k % 4 === 1 ? 2.5 : -2.5) : 0} />
          </Sequence>
        );
      })}
    </>
  );
};

// Instant (en images, relatif au début de la scène) où la voix prononce un mot : sert à caler les révélations
const nm = (m: string) => m.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
export function caler(s: any, from: number, textes: string[], dur: number, frac = 0.7, dernier = false): number[] {
  const mots: any[] = s.mots || [];
  let i0 = 0;
  return textes.map((tx, k) => {
    const cle = nm(String(tx).split(/\s+/)[0] || '');
    let trouve = -1;
    if (cle) {
      if (dernier) { for (let j = mots.length - 1; j >= i0; j--) if (nm(mots[j].mot) === cle) { trouve = j; break; } }
      else { for (let j = i0; j < mots.length; j++) if (nm(mots[j].mot) === cle) { trouve = j; break; } }
    }
    if (trouve >= 0) { i0 = trouve + 1; return Math.max(0, Math.round(mots[trouve].debut * FPS) - from - 2); }
    return Math.round((dur * frac * (k + (textes.length === 1 ? 1 : 0))) / Math.max(1, textes.length));
  });
}

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
      if (!/[\p{L}\p{N}]/u.test(m.mot)) { if (cur.length && j === s.mots.length - 1) { paquets.push(cur); cur = []; } return; }
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


// ---------- Habillages v2 : ils MONTRENT le fait ----------
const VERT = '#2BD96B';
const carte = (fond = '#fff') => ({background: fond, border: '8px solid #000', borderRadius: 28, boxShadow: '0 14px 0 #000'} as any);

// Vrai ou faux : l'affirmation, puis le verdict tamponné au moment où la voix le dit
const VraiFaux: React.FC<{vf: any; rev: number}> = ({vf, rev}) => {
  const f = useCurrentFrame();
  const vrai = String(vf.verdict).toUpperCase() === 'VRAI';
  const ent = spring({frame: f, fps: FPS, config: {damping: 13, stiffness: 190}});
  const sp = spring({frame: f - rev, fps: FPS, config: {damping: 11, stiffness: 260}});
  const apres = f >= rev;
  const coul = vrai ? VERT : ROUGE;
  const lg = String(vf.affirmation).length;
  const taille = lg <= 16 ? 124 : lg <= 26 ? 106 : 92;
  return (
    <>
      {apres ? <AbsoluteFill style={{background: coul, opacity: interpolate(f - rev, [0, 10], [0.45, 0.12], CL)}} /> : null}
      <div style={{position: 'absolute', top: 470, left: 0, width: 1080, display: 'flex', justifyContent: 'center'}}>
        <div style={{fontFamily: 'Anton', fontSize: 58, color: '#000', background: JAUNE, padding: '4px 26px', border: '6px solid #000', transform: `rotate(-4deg) scale(${interpolate(ent, [0, 1], [0.4, 1])})`}}>
          {vf.numero ? `#${vf.numero} · ` : ''}VRAI OU FAUX ?
        </div>
      </div>
      <div style={{position: 'absolute', top: 590, left: 80, width: 920, display: 'flex', justifyContent: 'center'}}>
        <div style={{...carte(), width: 900, boxSizing: 'border-box', borderColor: apres ? coul : '#000', padding: '34px 40px', transform: `rotate(-1.5deg) translateY(${(1 - ent) * 500}px)`, textAlign: 'center'}}>
          <div style={{fontFamily: 'Anton', fontSize: taille, lineHeight: 1.05, color: '#111', textTransform: 'uppercase'}}>{vf.affirmation}</div>
        </div>
      </div>
      {!apres ? (
        <div style={{position: 'absolute', top: 960, left: 0, width: 1080, textAlign: 'center', fontFamily: 'Anton', fontSize: 170, color: '#fff', ...contour(12), transform: `scale(${1 + 0.08 * Math.sin(f / 3)})`}}>?</div>
      ) : (
        <div style={{position: 'absolute', top: 930, left: 0, width: 1080, display: 'flex', justifyContent: 'center'}}>
          <div style={{transform: `rotate(-10deg) scale(${Math.max(0.92, interpolate(sp, [0, 1], [2.4, 1]))})`, opacity: interpolate(sp, [0, 0.12], [0, 1], CL), background: coul, color: '#fff', fontFamily: 'Anton', fontSize: 200, lineHeight: 1, padding: '10px 60px 22px', border: '12px solid #fff', boxShadow: '0 16px 0 #000', letterSpacing: 4, ...contour(10)}}>
            {vrai ? 'VRAI' : 'FAUX'}
          </div>
        </div>
      )}
    </>
  );
};

// Duel : deux barres qui s'affrontent, le compteur grimpe, le gagnant est couronné
const Duel: React.FC<{d: any}> = ({d}) => {
  const f = useCurrentFrame();
  const g = d.gauche, dr = d.droite;
  const max = Math.max(g.valeur, dr.valeur) || 1;
  const p = interpolate(f, [8, 34], [0, 1], {...CL, easing: Easing.out(Easing.cubic)});
  const fini = f >= 36;
  const gagnant = g.valeur >= dr.valeur ? 0 : 1;
  const vs = spring({frame: f, fps: FPS, config: {damping: 8, stiffness: 220}});
  const cou = spring({frame: f - 36, fps: FPS, config: {damping: 9, stiffness: 200}});
  const fmt = (v: number, cible: number) => (d.prefixe || '') + (Number.isInteger(cible) ? Math.round(v).toLocaleString('fr-FR') : v.toFixed(1).replace('.', ',')) + (d.suffixe || '');
  const col = (c: any, k: number) => {
    const h = 430 * (c.valeur / max) * p;
    const gagne = fini && k === gagnant;
    const perd = fini && k !== gagnant;
    const teinte = k === 0 ? JAUNE : '#4FD8FF';
    return (
      <div key={k} style={{position: 'absolute', left: k === 0 ? 90 : 590, width: 400, top: 0, height: 1250}}>
        <div style={{position: 'absolute', top: 440, width: 400, textAlign: 'center', fontFamily: 'Inter', fontWeight: 900, fontSize: 46, lineHeight: 1.08, color: '#fff', textTransform: 'uppercase', ...contour(9)}}>{c.label}</div>
        <div style={{position: 'absolute', bottom: h + 22, width: 400, textAlign: 'center', fontFamily: 'Anton', fontSize: gagne ? 130 : 104, color: perd ? '#9a9a9a' : teinte, ...contour(10), transform: `scale(${gagne ? interpolate(cou, [0, 1], [1.3, 1]) : 1})`}}>{fmt(c.valeur * p, c.valeur)}</div>
        <div style={{position: 'absolute', top: 1240 - h, left: 50, width: 300, height: h, background: perd ? '#6b6b6b' : teinte, border: '8px solid #000', borderBottom: 'none', boxShadow: gagne ? `0 0 60px ${teinte}` : 'none'}} />
        {gagne ? (
          <div style={{position: 'absolute', top: 1240 - h - 245, width: 400, textAlign: 'center', transform: `scale(${interpolate(cou, [0, 1], [0, 1])}) rotate(-8deg)`}}>
            <span style={{background: ROUGE, color: '#fff', fontFamily: 'Anton', fontSize: 58, padding: '4px 22px', border: '6px solid #fff', boxShadow: '0 8px 0 #000'}}>{d.titre_gagnant || 'GAGNANT'}</span>
          </div>
        ) : null}
      </div>
    );
  };
  return (
    <>
      <AbsoluteFill style={{background: 'rgba(0,0,0,0.5)'}} />
      {col(g, 0)}
      {col(dr, 1)}
      <div style={{position: 'absolute', top: 1240, left: 60, width: 960, height: 12, background: '#000'}} />
      <div style={{position: 'absolute', top: 780, left: 455, width: 170, height: 170, borderRadius: 85, background: ROUGE, border: '8px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton', fontSize: 84, color: '#fff', transform: `scale(${interpolate(vs, [0, 1], [2.5, 1]) * (fini ? interpolate(f, [36, 44], [1, 0], CL) : 1)})`, boxShadow: '0 10px 0 #000'}}>VS</div>
    </>
  );
};

// Frise : les dates apparaissent au fil de la voix, les reports sont barrés
const Frise: React.FC<{fr: any; instants: number[]}> = ({fr, instants}) => {
  const f = useCurrentFrame();
  const et: any[] = fr.etapes || [];
  const pas = Math.min(230, 760 / Math.max(1, et.length));
  return (
    <>
      <AbsoluteFill style={{background: 'rgba(0,0,0,0.42)'}} />
      {fr.titre ? <div style={{position: 'absolute', top: 400, left: 0, width: 1080, textAlign: 'center', fontFamily: 'Anton', fontSize: 74, color: JAUNE, ...contour(9)}}>{fr.titre}</div> : null}
      <div style={{position: 'absolute', left: 150, top: 540, width: 14, height: pas * (et.length - 1) * interpolate(f, [0, Math.max(1, instants[instants.length - 1] || 1)], [0, 1], CL), background: '#fff', border: '4px solid #000'}} />
      {et.map((e, k) => {
        const a = instants[k] ?? 0;
        const sp = spring({frame: f - a, fps: FPS, config: {damping: 12, stiffness: 210}});
        const barre = !!e.barre;
        const trait = interpolate(f - a, [8, 16], [0, 1], CL);
        const derniere = !barre && k === et.length - 1;
        if (f < a) return null;
        return (
          <div key={k} style={{position: 'absolute', top: 500 + k * pas, left: 110, width: 900, height: 110, transform: `translateX(${(1 - sp) * 700}px)`}}>
            <div style={{position: 'absolute', left: 14, top: 26, width: 56, height: 56, borderRadius: 28, background: derniere ? JAUNE : barre ? ROUGE : '#fff', border: '7px solid #000'}} />
            <div style={{position: 'absolute', left: 110, top: 0, padding: '2px 30px', ...carte(derniere ? JAUNE : '#fff'), transform: derniere ? `scale(${1 + 0.04 * Math.sin(f / 4)})` : 'none', transformOrigin: 'left center'}}>
              <span style={{fontFamily: 'Anton', fontSize: 80, color: barre ? '#777' : '#111', whiteSpace: 'nowrap'}}>{e.date}</span>
              <div style={{position: 'absolute', left: 20, top: 52, height: 12, width: `${trait * 92}%`, background: ROUGE, transform: 'rotate(-3deg)', display: barre ? 'block' : 'none'}} />
            </div>
            {barre && trait >= 1 ? (
              <span style={{position: 'absolute', right: 0, top: 18, background: ROUGE, color: '#fff', fontFamily: 'Anton', fontSize: 44, padding: '2px 16px', border: '5px solid #fff', transform: 'rotate(8deg)'}}>{e.mention || fr.mention || 'REPORTÉ'}</span>
            ) : null}
          </div>
        );
      })}
    </>
  );
};

// Quiz : question, choix qui tombent au fil de la voix, chrono, bonne réponse révélée à la fin
const Quiz: React.FC<{q: any; instants: number[]; dur: number}> = ({q, instants, dur}) => {
  const f = useCurrentFrame();
  const rev = dur - 14;
  const fin = f >= rev;
  const ch: string[] = q.choix || [];
  const qsp = spring({frame: f, fps: FPS, config: {damping: 12, stiffness: 200}});
  return (
    <>
      <AbsoluteFill style={{background: 'rgba(0,0,0,0.4)'}} />
      <div style={{position: 'absolute', top: 420, left: 70, width: 940, textAlign: 'center', fontFamily: 'Anton', fontSize: 86, lineHeight: 1.05, color: '#fff', textTransform: 'uppercase', ...contour(10), transform: `scale(${interpolate(qsp, [0, 1], [0.5, 1])})`}}>{q.question}</div>
      <div style={{position: 'absolute', top: 680, left: 140, width: 800, height: 22, background: '#000', border: '5px solid #fff', borderRadius: 12}}>
        <div style={{width: `${interpolate(f, [0, rev], [100, 0], CL)}%`, height: '100%', background: f > rev * 0.7 ? ROUGE : JAUNE, borderRadius: 8}} />
      </div>
      {ch.map((c, k) => {
        const a = instants[k] ?? 0;
        const sp = spring({frame: f - a, fps: FPS, config: {damping: 11, stiffness: 230}});
        const bon = k === q.bonne;
        const fond = fin ? (bon ? VERT : '#5a5a5a') : '#fff';
        if (f < a) return null;
        return (
          <div key={k} style={{position: 'absolute', top: 760 + k * 160, left: 140, width: 800, height: 130, display: 'flex', alignItems: 'center', ...carte(fond), transform: `scale(${interpolate(sp, [0, 1], [0.3, 1]) * (fin && bon ? 1.07 : 1)})`, opacity: fin && !bon ? 0.75 : 1}}>
            <div style={{width: 92, height: 92, marginLeft: 18, borderRadius: 46, background: '#000', color: JAUNE, fontFamily: 'Anton', fontSize: 60, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{fin && bon ? '✓' : 'ABCD'[k]}</div>
            <div style={{marginLeft: 30, fontFamily: 'Anton', fontSize: 72, color: fin && !bon ? '#ddd' : '#111', textTransform: 'uppercase'}}>{c}</div>
          </div>
        );
      })}
    </>
  );
};

// Alerte info : bandeau rouge façon chaîne d'info
const Alerte: React.FC<{a: any; bas: string}> = ({a, bas}) => {
  const f = useCurrentFrame();
  const sp = spring({frame: f, fps: FPS, config: {damping: 14, stiffness: 220}});
  const x = (1 - sp) * -1100;
  const defile = `${bas}   •   `.repeat(8);
  return (
    <>
      <AbsoluteFill style={{background: 'rgba(0,0,0,0.3)'}} />
      <div style={{position: 'absolute', top: 520, left: 0, width: 1080, transform: `translateX(${x}px) rotate(-2deg)`}}>
        <div style={{display: 'flex', alignItems: 'center', marginLeft: 50}}>
          <div style={{background: '#fff', color: ROUGE, fontFamily: 'Anton', fontSize: 64, padding: '4px 24px', border: '6px solid #000'}}>{a.titre || 'ALERTE INFO'}</div>
          <div style={{marginLeft: 20, display: 'flex', alignItems: 'center', fontFamily: 'Inter', fontWeight: 900, fontSize: 40, color: '#fff', ...contour(7)}}>
            <span style={{display: 'inline-block', width: 30, height: 30, borderRadius: 15, background: ROUGE, marginRight: 12, opacity: Math.floor(f / 8) % 2 ? 0.25 : 1, border: '4px solid #fff'}} />EN DIRECT
          </div>
        </div>
        <div style={{marginTop: 16, background: ROUGE, borderTop: '8px solid #000', borderBottom: '8px solid #000', padding: '26px 50px'}}>
          <div style={{fontFamily: 'Anton', fontSize: Math.min(110, 2000 / Math.max(14, String(a.texte).length)), lineHeight: 1.04, color: '#fff', textTransform: 'uppercase', ...contour(8)}}>{a.texte}</div>
        </div>
        <div style={{background: '#000', overflow: 'hidden', whiteSpace: 'nowrap', padding: '10px 0'}}>
          <span style={{display: 'inline-block', transform: `translateX(${-f * 9}px)`, fontFamily: 'Inter', fontWeight: 900, fontSize: 38, color: JAUNE}}>{defile}</span>
        </div>
      </div>
    </>
  );
};

// Liste : le numéro qui claque, puis le titre de l'élément
const Liste: React.FC<{l: any}> = ({l}) => {
  const f = useCurrentFrame();
  const sp = spring({frame: f, fps: FPS, config: {damping: 9, stiffness: 200}});
  return (
    <>
      <div style={{position: 'absolute', top: 360, left: 0, width: 1080, textAlign: 'center', transform: `translateX(${(1 - sp) * 900}px) rotate(${-6 + (1 - sp) * 30}deg)`}}>
        <span style={{fontFamily: 'Anton', fontSize: 330, lineHeight: 1, color: JAUNE, ...contour(18)}}>#{l.numero}</span>
      </div>
      {l.texte ? <Gros texte={l.texte} top={760} debut={6} /> : null}
    </>
  );
};

// ---------- Scène ----------
const PLEIN = ['vrai_faux', 'duel', 'frise', 'quiz', 'alerte'];
const Scene: React.FC<{s: any; dur: number; idx: number; from: number; titre: string}> = ({s, dur, idx, from, titre}) => {
  const f = useCurrentFrame();
  const push = interpolate(f, [0, dur], [1, 1.06]);
  // transitions variées entre scènes : flash, fouetté flou, flash jaune
  const style = idx % 3;
  const flash = idx === 0 ? 0 : interpolate(f, [0, 4], [style === 2 ? 0.7 : 0.9, 0], CL);
  const flou = idx > 0 && style === 1 ? interpolate(f, [0, 6], [14, 0], CL) : 0;
  const zoomT = idx > 0 && style === 1 ? interpolate(f, [0, 7], [1.3, 1], {...CL, easing: Easing.out(Easing.cubic)}) : 1;
  let sec = idx > 0 && f < 6 ? (f % 2 ? 14 : -14) * (1 - f / 6) : 0;
  let revVF = -1;
  if (s.vrai_faux) {
    revVF = caler(s, from, [String(s.vrai_faux.verdict)], dur, 0.62, true)[0];
    if (f >= revVF && f < revVF + 7) sec += ((f - revVF) % 2 ? 18 : -18) * (1 - (f - revVF) / 7);
  }
  const plein = PLEIN.some((k) => s[k]);
  const glitch = idx === 0 ? interpolate(f, [0, 10], [12, 0], CL) : 0;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{transform: `translate(${sec}px, ${-sec * 0.5}px) scale(${push * zoomT})`, filter: flou ? `blur(${flou}px)` : undefined}}>
        <Fond plans={s.plans} seed={s.seed} dur={dur} />
      </AbsoluteFill>
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%)'}} />
      {(s.gros || s.compteur || s.question || s.liste) && !plein ? <AbsoluteFill style={{background: 'radial-gradient(ellipse 62% 20% at 50% 37%, rgba(0,0,0,0.5), rgba(0,0,0,0) 75%)'}} /> : null}
      <AbsoluteFill style={{transform: `translate(${sec * 0.6}px, 0)`, filter: glitch ? `drop-shadow(${glitch}px 0 0 rgba(255,0,70,0.85)) drop-shadow(${-glitch}px 0 0 rgba(0,230,255,0.85))` : undefined}}>
        {s.gros ? <Gros texte={s.gros} top={560} debut={idx === 0 ? -40 : 0} ecart={idx === 0 ? 1 : 3} /> : null}
        {s.compteur ? <Compteur c={s.compteur} top={540} /> : null}
        {s.tampon ? <Tampon texte={s.tampon} a={Math.round((s.tamponA ?? 1) * FPS)} top={1060} /> : null}
        {s.question ? <Question q={s.question} top={520} dur={dur} /> : null}
        {s.vrai_faux ? <VraiFaux vf={s.vrai_faux} rev={revVF} /> : null}
        {s.duel ? <Duel d={s.duel} /> : null}
        {s.frise ? <Frise fr={s.frise} instants={caler(s, from, (s.frise.etapes || []).map((e: any) => e.date), dur, 0.75)} /> : null}
        {s.quiz ? <Quiz q={s.quiz} instants={caler(s, from, s.quiz.choix || [], dur, 0.6)} dur={dur} /> : null}
        {s.alerte ? <Alerte a={s.alerte} bas={titre} /> : null}
        {s.liste ? <Liste l={s.liste} /> : null}
      </AbsoluteFill>
      <AbsoluteFill style={{background: style === 2 ? JAUNE : '#fff', opacity: flash}} />
    </AbsoluteFill>
  );
};

export const Viral: React.FC<{story: any; timing: any}> = ({story, timing}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  if (!story || !timing) return null;
  const scenes = story.scenes.map((s: any, i: number) => ({...s, mots: timing.scenes[i].mots, t0: timing.scenes[i].debut}));
  const nom = story.chaine?.nom || '';
  return (
    <AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
      {scenes.map((s: any, i: number) => {
        const from = i === 0 ? 0 : Math.round(s.t0 * FPS);
        const to = i < scenes.length - 1 ? Math.round(scenes[i + 1].t0 * FPS) : durationInFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={to - from} layout="none">
            <Scene s={s} dur={to - from} idx={i} from={from} titre={(story.titre || nom).toUpperCase()} />
          </Sequence>
        );
      })}
      <AbsoluteFill style={{background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.13) 0px, rgba(0,0,0,0.13) 2px, transparent 2px, transparent 4px)', pointerEvents: 'none'}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 65% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)'}} />
      <SousTitres scenes={scenes} t={frame / FPS} />
      <div style={{position: 'absolute', top: 236, left: 60, width: 960, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.25)'}}>
        <div style={{width: `${(frame / durationInFrames) * 100}%`, height: '100%', borderRadius: 5, background: JAUNE}} />
      </div>
      {nom ? (
        <div style={{position: 'absolute', top: 268, left: 60, background: '#000', border: `4px solid ${JAUNE}`, padding: '2px 16px', fontFamily: 'Anton', fontSize: 36, letterSpacing: 2, color: JAUNE}}>{nom}</div>
      ) : null}
    </AbsoluteFill>
  );
};
