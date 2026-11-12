// Composition « Doc » : mini-documentaire vertical. Vraies images en fond (clips préparés par visuels.py),
// habillage façon dossier d'enquête, gros sous-titres mot à mot, grain de film, montage nerveux.
import React from 'react';
import {AbsoluteFill, Sequence, OffthreadVideo, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, staticFile, delayRender, continueRender, random} from 'remotion';
import {Plan3D, caler, FPS} from './Viral';

const CL = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ROUGE = '#E5232E';
const JAUNE = '#FFD23F';
const PAPIER = '#EFE7D6';

if (typeof window !== 'undefined') {
  const h = delayRender('polices-doc');
  const polices: [string, string, string][] = [
    ['Bebas', 'fonts/BebasNeue.woff2', '400'],
    ['Mont', 'fonts/Montserrat-800.woff2', '800'],
    ['Mont', 'fonts/Montserrat-900.woff2', '900'],
    ['Machine', 'fonts/SpecialElite.woff2', '400'],
    ['Presse', 'fonts/Playfair-900.woff2', '900'],
  ];
  Promise.all(polices.map(([nom, f, poids]) => new FontFace(nom, `url(${staticFile(f)})`, {weight: poids}).load().then((ff) => (document.fonts as any).add(ff))))
    .then(() => continueRender(h)).catch(() => continueRender(h));
}

const ombre = (px: number) => ({textShadow: `0 ${px}px ${px * 2}px rgba(0,0,0,0.85), 0 0 ${px}px rgba(0,0,0,0.6)`} as any);
const contour = (px: number) => ({WebkitTextStroke: `${px}px #000`, paintOrder: 'stroke fill'} as any);

// ---------- Fond : un morceau de vraie vidéo (ou de 3D) par coupe ----------
const Morceau: React.FC<{seg: any; seed: number; k: number; tout1er: boolean}> = ({seg, seed, k, tout1er}) => {
  const f = useCurrentFrame();
  const d = seg.duree;
  // Le plan de raccord (fin de vidéo) finit exactement dans le cadrage où commence le tout premier plan : la boucle est invisible.
  const zoom = interpolate(f, [0, d], seg.raccord ? [1.09, 1.0] : k % 2 ? [1.1, 1.0] : [1.0, 1.09]);
  const punch = tout1er || seg.raccord ? 1 : interpolate(f, [0, 5], [1.1, 1], {...CL, easing: Easing.out(Easing.cubic)});
  const dx = interpolate(f, [0, d], seg.raccord ? [-40, -18] : k % 3 === 0 ? [-18, 18] : k % 3 === 1 ? [16, -16] : [0, 0]);
  if (seg.type === 'video') {
    return (
      <AbsoluteFill style={{transform: `translateX(${dx}px) scale(${zoom * punch})`}}>
        <OffthreadVideo src={staticFile(seg.src)} muted style={{width: 1080, height: 1920, objectFit: 'cover'}} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{filter: 'saturate(0.85) contrast(1.05)'}}>
      <Plan3D plan={seg.plan} seed={seed + k * 7} dur={d} decal={(k * 1.9) % 5} zoom={k % 2 ? 1.12 : 1} />
    </AbsoluteFill>
  );
};

const Fond: React.FC<{segs: any[]; seed: number; idx: number}> = ({segs, seed, idx}) => {
  let t = 0;
  return (
    <>
      {segs.map((s, k) => {
        const from = t;
        t += s.duree;
        return (
          <Sequence key={k} from={from} durationInFrames={s.duree} layout="none">
            <Morceau seg={s} seed={seed} k={k} tout1er={idx === 0 && k === 0} />
            {k > 0 ? <Flash /> : null}
          </Sequence>
        );
      })}
    </>
  );
};

const Flash: React.FC = () => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{background: '#fff', opacity: interpolate(f, [0, 2], [0.18, 0], CL)}} />;
};

// ---------- Habillages « dossier » ----------
// Titre choc (accroche, relance) : lignes empilées, une ligne sur deux sur bandeau rouge
const Titre: React.FC<{texte: string; top: number; accroche?: boolean}> = ({texte, top, accroche}) => {
  const f = useCurrentFrame();
  const lignes = texte.split('|');
  const lg = Math.max(...lignes.map((l) => l.length));
  const taille = Math.min(230, 1000 / (0.42 * lg));
  return (
    <div style={{position: 'absolute', top, left: 0, width: 1080, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      {lignes.map((l, i) => {
        const a = accroche ? i * 3 - 30 : i * 5;
        const sp = spring({frame: f - a, fps: FPS, config: {damping: 14, stiffness: 240}});
        const rouge = i % 2 === 1;
        return (
          <div key={i} style={{transform: `translateY(${(1 - sp) * 60}px) scale(${interpolate(sp, [0, 1], [1.25, 1])})`, opacity: interpolate(sp, [0, 0.2], [0, 1], CL), marginTop: i ? 10 : 0}}>
            <span style={{fontFamily: 'Bebas', fontSize: taille, lineHeight: 0.95, color: '#fff', padding: rouge ? '4px 26px 0' : 0, background: rouge ? ROUGE : 'transparent', display: 'inline-block', ...(rouge ? {} : ombre(10))}}>{l}</span>
          </div>
        );
      })}
    </div>
  );
};

// Lieu et date, tapés à la machine (début d'histoire, changement de décor)
const Lieu: React.FC<{texte: string}> = ({texte}) => {
  const f = useCurrentFrame();
  const n = Math.floor(interpolate(f, [3, 3 + texte.length * 1.1], [0, texte.length], CL));
  const barre = interpolate(f, [0, 8], [0, 1], {...CL, easing: Easing.out(Easing.cubic)});
  return (
    <div style={{position: 'absolute', top: 330, left: 70, display: 'flex', alignItems: 'center'}}>
      <div style={{width: 16, height: 70, background: ROUGE, marginRight: 22, transform: `scaleY(${barre})`}} />
      <div style={{background: 'rgba(0,0,0,0.72)', padding: '14px 26px', fontFamily: 'Machine', fontSize: 50, color: '#fff', letterSpacing: 2, whiteSpace: 'nowrap', opacity: barre}}>
        {texte.slice(0, n)}
        <span style={{opacity: Math.floor(f / 8) % 2 ? 0 : 1, color: ROUGE}}>▌</span>
      </div>
    </div>
  );
};

// Morceau de document : lignes tapées, mots caviardés [[...]], tampon final
const Document: React.FC<{doc: any; dur: number}> = ({doc, dur}) => {
  const f = useCurrentFrame();
  const ent = spring({frame: f, fps: FPS, config: {damping: 16, stiffness: 180}});
  const lignes: string[] = doc.lignes || [];
  const pas = Math.max(6, Math.floor((dur * 0.55) / Math.max(1, lignes.length)));
  const tamponA = Math.round(dur * 0.62);
  const sp = spring({frame: f - tamponA, fps: FPS, config: {damping: 12, stiffness: 260}});
  return (
    <div style={{position: 'absolute', top: 420, left: 110, width: 860, transform: `translateY(${(1 - ent) * 900}px) rotate(${-2.5 + (1 - ent) * 6}deg)`}}>
      <div style={{background: PAPIER, padding: '46px 54px 56px', boxShadow: '0 30px 60px rgba(0,0,0,0.6)', backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0 2px, transparent 2px 40px)'}}>
        <div style={{fontFamily: 'Machine', fontSize: 34, color: '#7a6f60', letterSpacing: 3}}>{doc.entete || 'DOSSIER N° 0611'}</div>
        <div style={{fontFamily: 'Machine', fontSize: 64, color: '#141414', marginTop: 8, borderBottom: '4px solid #141414', paddingBottom: 12}}>{doc.titre}</div>
        {lignes.map((l, i) => {
          const a = 8 + i * pas;
          if (f < a) return null;
          const morceaux = l.split(/(\[\[[^\]]*\]\])/);
          return (
            <div key={i} style={{fontFamily: 'Machine', fontSize: 52, color: '#1b1b1b', marginTop: 22, lineHeight: 1.15, opacity: interpolate(f - a, [0, 4], [0, 1], CL)}}>
              {morceaux.map((m, j) => m.startsWith('[[') ? (
                <span key={j} style={{background: '#111', color: '#111', padding: '0 6px'}}>{m.slice(2, -2)}</span>
              ) : <span key={j}>{m}</span>)}
            </div>
          );
        })}
      </div>
      {doc.tampon && f >= tamponA ? (
        <div style={{position: 'absolute', right: 30, bottom: -40, transform: `rotate(-14deg) scale(${Math.max(0.95, interpolate(sp, [0, 1], [2.6, 1]))})`, opacity: interpolate(sp, [0, 0.15], [0, 0.92], CL),
          border: `10px solid ${ROUGE}`, outline: `4px solid ${ROUGE}`, outlineOffset: 8, color: ROUGE, fontFamily: 'Bebas', fontSize: 120, padding: '4px 30px 0', letterSpacing: 6}}>
          {doc.tampon}
        </div>
      ) : null}
    </div>
  );
};

// Coupure de presse : la source et la date, un titre réécrit (jamais le logo du média)
const Coupure: React.FC<{c: any}> = ({c}) => {
  const f = useCurrentFrame();
  const sp = spring({frame: f, fps: FPS, config: {damping: 15, stiffness: 200}});
  const dents = Array.from({length: 25}, (_, i) => `${100 - (i / 24) * 100}% ${i % 2 ? 100 : 97}%`).join(', ');
  return (
    <div style={{position: 'absolute', top: 430, left: 90, width: 900, transform: `translateX(${(1 - sp) * 1100}px) rotate(${3 - (1 - sp) * 8}deg)`, filter: 'drop-shadow(0 26px 40px rgba(0,0,0,0.65))'}}>
      <div style={{background: '#F4F1EA', padding: '40px 50px 70px', clipPath: `polygon(0% 1.5%, 100% 0%, ${dents})`}}>
        <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid #222', paddingBottom: 12, fontFamily: 'Mont', fontWeight: 800, fontSize: 30, color: '#333', letterSpacing: 2}}>
          <span>SOURCE : {String(c.source || '').toUpperCase()}</span><span>{c.date}</span>
        </div>
        <div style={{fontFamily: 'Presse', fontWeight: 900, fontSize: Math.min(112, 3600 / Math.max(20, String(c.titre).length)), lineHeight: 1.05, color: '#111', marginTop: 22}}>{c.titre}</div>
        {c.chapo ? <div style={{fontFamily: 'Mont', fontWeight: 800, fontSize: 36, color: '#444', marginTop: 18, lineHeight: 1.25}}>{c.chapo}</div> : null}
      </div>
    </div>
  );
};

// Chiffre qui défile, étiquette sur bandeau rouge
const Chiffre: React.FC<{c: any; top: number}> = ({c, top}) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [2, 22], [0, 1], {...CL, easing: Easing.out(Easing.cubic)});
  const v = c.valeur * p;
  const txt = Number.isInteger(c.valeur) ? Math.round(v).toLocaleString('fr-FR') : v.toFixed(1).replace('.', ',');
  const lab = spring({frame: f - 10, fps: FPS, config: {damping: 14, stiffness: 200}});
  const pop = f >= 22 ? interpolate(spring({frame: f - 22, fps: FPS, config: {damping: 9, stiffness: 250}}), [0, 1], [1.12, 1]) : 1;
  return (
    <div style={{position: 'absolute', top, left: 0, width: 1080, textAlign: 'center'}}>
      <div style={{fontFamily: 'Bebas', fontSize: 300, lineHeight: 0.9, color: '#fff', ...ombre(12), transform: `scale(${pop})`}}>
        {(c.prefixe || '') + txt}<span style={{fontSize: 170, color: JAUNE}}>{c.suffixe || ''}</span>
      </div>
      {c.label ? (
        <div style={{display: 'inline-block', marginTop: 16, background: ROUGE, color: '#fff', fontFamily: 'Mont', fontWeight: 900, fontSize: 50, padding: '10px 26px', transform: `scaleX(${lab})`, letterSpacing: 1}}>{c.label}</div>
      ) : null}
    </div>
  );
};

// Tampon plein écran (CONDAMNÉ, LICENCIÉ, FUITE…)
const Tampon: React.FC<{texte: string; a: number}> = ({texte, a}) => {
  const f = useCurrentFrame();
  if (f < a) return null;
  const sp = spring({frame: f - a, fps: FPS, config: {damping: 12, stiffness: 280}});
  return (
    <div style={{position: 'absolute', top: 780, left: 0, width: 1080, display: 'flex', justifyContent: 'center'}}>
      <div style={{transform: `rotate(-12deg) scale(${Math.max(0.95, interpolate(sp, [0, 1], [3, 1]))})`, opacity: interpolate(sp, [0, 0.12], [0, 0.95], CL),
        border: `14px solid ${ROUGE}`, outline: `5px solid ${ROUGE}`, outlineOffset: 10, color: ROUGE, fontFamily: 'Bebas', fontSize: texte.length > 10 ? 150 : 190, lineHeight: 0.92, textAlign: 'center', maxWidth: 860, padding: '14px 40px 4px', letterSpacing: 6, background: 'rgba(0,0,0,0.25)'}}>
        {texte}
      </div>
    </div>
  );
};

// Question finale
const Question: React.FC<{q: any; dur: number}> = ({q, dur}) => {
  const f = useCurrentFrame();
  const a = Math.round(dur * 0.3);
  const lignes = String(q.texte).split('|');
  const taille = Math.min(230, 1000 / (0.42 * Math.max(...lignes.map((l) => l.length))));
  const bas = 520 + lignes.length * (taille * 0.95 + 10) + 50;
  const sp = spring({frame: f - a, fps: FPS, config: {damping: 10, stiffness: 180}});
  return (
    <>
      <Titre texte={q.texte} top={520} />
      {f >= a ? (
        <div style={{position: 'absolute', top: bas, left: 0, width: 1080, display: 'flex', justifyContent: 'center'}}>
          <div style={{transform: `scale(${interpolate(sp, [0, 1], [0.3, 1]) * (1 + 0.03 * Math.sin(f / 4))})`, background: '#fff', color: '#000', fontFamily: 'Mont', fontWeight: 900, fontSize: 50, padding: '22px 42px', borderRadius: 44, boxShadow: '0 12px 30px rgba(0,0,0,0.5)'}}>
            {q.bulle}
          </div>
        </div>
      ) : null}
    </>
  );
};

// ---------- Sous-titres : 1 à 3 mots, le mot dit en jaune ----------
const SousTitres: React.FC<{scenes: any[]; t: number}> = ({scenes, t}) => {
  const paquets: any[][] = [];
  for (const s of scenes) {
    let cur: any[] = [];
    s.mots.forEach((m: any, j: number) => {
      if (!/[\p{L}\p{N}]/u.test(m.mot)) { if (cur.length && j === s.mots.length - 1) { paquets.push(cur); cur = []; } return; }
      cur.push(m);
      if (cur.length >= 3 || /[.,!?:;…]$/.test(m.mot) || j === s.mots.length - 1) { paquets.push(cur); cur = []; }
    });
  }
  const k = paquets.findIndex((p, i) => {
    const fin = i < paquets.length - 1 ? Math.min(paquets[i + 1][0].debut, p[p.length - 1].fin + 0.4) : p[p.length - 1].fin + 0.4;
    return t >= p[0].debut - 0.04 && t < fin - 0.04;
  });
  if (k < 0) return null;
  const p = paquets[k];
  const pop = interpolate(t - p[0].debut, [-0.04, 0.08], [0.82, 1], {...CL, easing: Easing.out(Easing.back(2.2))});
  return (
    <div style={{position: 'absolute', top: 1270, left: 60, width: 960, display: 'flex', justifyContent: 'center'}}>
      <div style={{transform: `scale(${pop})`, fontFamily: 'Mont', fontWeight: 900, fontSize: 84, lineHeight: 1.08, textAlign: 'center', textTransform: 'uppercase', ...contour(14), ...ombre(6)}}>
        {p.map((m: any, i: number) => {
          const actif = t >= m.debut - 0.03 && t < m.fin + 0.03;
          return <span key={i} style={{color: actif ? JAUNE : '#fff', display: 'inline-block', margin: '0 0.18em'}}>{m.mot.replace(/[,;:]$/, '')}</span>;
        })}
      </div>
    </div>
  );
};

// Grain de film (texture qui bouge à chaque image)
const Grain: React.FC = () => {
  const f = useCurrentFrame();
  const x = Math.floor(random(`gx${f}`) * 256), y = Math.floor(random(`gy${f}`) * 256);
  return <AbsoluteFill style={{backgroundImage: `url(${staticFile('grain.png')})`, backgroundPosition: `${x}px ${y}px`, opacity: 0.07, pointerEvents: 'none'}} />;
};

// ---------- Scène ----------
const Scene: React.FC<{s: any; dur: number; idx: number; from: number}> = ({s, dur, idx, from}) => {
  const f = useCurrentFrame();
  const sec = idx > 0 && f < 6 ? (f % 2 ? 10 : -10) * (1 - f / 6) : 0;
  const tamponA = s.tampon ? (s.tamponMot ? caler(s, from, [s.tamponMot], dur, 0.6, true)[0] : Math.round((s.tamponA ?? dur / FPS * 0.6) * FPS)) : 0;
  const choc = s.tampon && f >= tamponA && f < tamponA + 6 ? ((f - tamponA) % 2 ? 14 : -14) : 0;
  const voile = s.document || s.coupure ? 0.45 : s.gros || s.compteur || s.question || s.tampon ? 0.22 : 0;
  return (
    <AbsoluteFill style={{transform: `translate(${sec + choc}px, ${-(sec + choc) * 0.4}px)`}}>
      <Fond segs={s.segments || [{type: '3d', plan: 'rue_neon', duree: dur}]} seed={s.seed || 11} idx={idx} />
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.7) 100%)'}} />
      {voile ? <AbsoluteFill style={{background: `rgba(0,0,0,${voile})`}} /> : null}
      {s.lieu ? <Lieu texte={s.lieu} /> : null}
      {s.gros ? <Titre texte={s.gros} top={idx === 0 ? 520 : 560} accroche={idx === 0} /> : null}
      {s.compteur ? <Chiffre c={s.compteur} top={520} /> : null}
      {s.document ? <Document doc={s.document} dur={dur} /> : null}
      {s.coupure ? <Coupure c={s.coupure} /> : null}
      {s.question ? <Question q={s.question} dur={dur} /> : null}
      {s.tampon ? <Tampon texte={s.tampon} a={tamponA} /> : null}
    </AbsoluteFill>
  );
};

export const Doc: React.FC<{story: any; timing: any}> = ({story, timing}) => {
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
            <Scene s={s} dur={to - from} idx={i} from={from} />
          </Sequence>
        );
      })}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 78% 62% at 50% 48%, transparent 55%, rgba(0,0,0,0.6) 100%)'}} />
      <Grain />
      <SousTitres scenes={scenes} t={frame / FPS} />
    </AbsoluteFill>
  );
};
