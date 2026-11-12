// Composition « Doc » : mini-documentaire vertical. Vraies images en fond (clips préparés par visuels.py),
// gros sous-titres mot à mot, montage nerveux. Cinq thèmes visuels (story.theme) pour que deux vidéos
// ne se ressemblent jamais : dossier, neon, presse, data, terminal.
import React from 'react';
import {AbsoluteFill, Sequence, OffthreadVideo, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, staticFile, delayRender, continueRender, random} from 'remotion';
import {Plan3D, caler, FPS} from './Viral';

const CL = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

if (typeof window !== 'undefined') {
  const h = delayRender('polices-doc');
  const polices: [string, string, string][] = [
    ['Bebas', 'fonts/BebasNeue.woff2', '400'],
    ['Mont', 'fonts/Montserrat-800.woff2', '800'],
    ['Mont', 'fonts/Montserrat-900.woff2', '900'],
    ['Machine', 'fonts/SpecialElite.woff2', '400'],
    ['Presse', 'fonts/Playfair-900.woff2', '900'],
    ['Mono', 'fonts/JetBrainsMono.ttf', '400'],
  ];
  Promise.all(polices.map(([nom, f, poids]) => new FontFace(nom, `url(${staticFile(f)})`, {weight: poids}).load().then((ff) => (document.fonts as any).add(ff))))
    .then(() => continueRender(h)).catch(() => continueRender(h));
}

// ---------- Thèmes ----------
type Theme = {
  nom: string; accent: string; accent2: string; encre: string;
  titre: string; titrePoids: number; largeur: number;   // police des titres et largeur moyenne d'un caractère (en em)
  sousTitres: {police: string; poids: number; taille: number; majuscules: boolean; actif: string; mode: 'contour' | 'boite' | 'glow' | 'ombre' | 'mono'};
  grain: number; flash: string; flashForce: number; papier: string;
};
const THEMES: Record<string, Theme> = {
  dossier: {nom: 'dossier', accent: '#E5232E', accent2: '#FFD23F', encre: '#fff', titre: 'Bebas', titrePoids: 400, largeur: 0.42,
    sousTitres: {police: 'Mont', poids: 900, taille: 84, majuscules: true, actif: '#FFD23F', mode: 'contour'}, grain: 0.07, flash: '#fff', flashForce: 0.18, papier: '#EFE7D6'},
  neon: {nom: 'neon', accent: '#FF2E88', accent2: '#2EF2FF', encre: '#fff', titre: 'Bebas', titrePoids: 400, largeur: 0.42,
    sousTitres: {police: 'Mont', poids: 900, taille: 82, majuscules: true, actif: '#FF2E88', mode: 'glow'}, grain: 0.04, flash: '#FF2E88', flashForce: 0.22, papier: '#14061F'},
  presse: {nom: 'presse', accent: '#C8102E', accent2: '#F5C518', encre: '#111', titre: 'Presse', titrePoids: 900, largeur: 0.62,
    sousTitres: {police: 'Mont', poids: 800, taille: 66, majuscules: false, actif: '#F5C518', mode: 'boite'}, grain: 0.1, flash: '#F2EBDD', flashForce: 0.12, papier: '#F2EBDD'},
  data: {nom: 'data', accent: '#FFD400', accent2: '#00C2FF', encre: '#fff', titre: 'Mont', titrePoids: 900, largeur: 0.66,
    sousTitres: {police: 'Mont', poids: 900, taille: 76, majuscules: false, actif: '#FFD400', mode: 'ombre'}, grain: 0.03, flash: '#fff', flashForce: 0, papier: '#0E1116'},
  terminal: {nom: 'terminal', accent: '#39FF14', accent2: '#00E5FF', encre: '#D8FFD0', titre: 'Mono', titrePoids: 400, largeur: 0.62,
    sousTitres: {police: 'Mono', poids: 400, taille: 70, majuscules: true, actif: '#39FF14', mode: 'mono'}, grain: 0.06, flash: '#39FF14', flashForce: 0.12, papier: '#050A05'},
};
const ThemeCtx = React.createContext<Theme>(THEMES.dossier);
const useT = () => React.useContext(ThemeCtx);

const ombre = (px: number) => ({textShadow: `0 ${px}px ${px * 2}px rgba(0,0,0,0.85), 0 0 ${px}px rgba(0,0,0,0.6)`} as any);
const contour = (px: number, c = '#000') => ({WebkitTextStroke: `${px}px ${c}`, paintOrder: 'stroke fill'} as any);
const lueur = (c: string) => ({textShadow: `0 0 14px ${c}, 0 0 34px ${c}`} as any);
// Tube néon : cœur presque blanc, halo de couleur (lisible sur n'importe quelle image)
const tube = (c: string) => ({color: c === '#2EF2FF' ? '#E4FEFF' : '#FFE3F1', textShadow: `0 0 4px ${c}, 0 0 14px ${c}, 0 0 34px ${c}, 0 0 70px ${c}, 0 6px 18px rgba(0,0,0,0.9)`} as any);

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

const Flash: React.FC = () => {
  const f = useCurrentFrame();
  const T = useT();
  if (!T.flashForce) return null;
  return <AbsoluteFill style={{background: T.flash, opacity: interpolate(f, [0, 2], [T.flashForce, 0], CL)}} />;
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

// ---------- Titre choc ----------
const Titre: React.FC<{texte: string; top: number; accroche?: boolean}> = ({texte, top, accroche}) => {
  const f = useCurrentFrame();
  const T = useT();
  const lignes = texte.split('|');
  const lg = Math.max(...lignes.map((l) => l.length));
  const taille = Math.min(T.nom === 'presse' ? 170 : T.nom === 'data' ? 150 : T.nom === 'terminal' ? 120 : 230, 980 / (T.largeur * lg));
  return (
    <div style={{position: 'absolute', top, left: 0, width: 1080, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: T.nom === 'presse' ? 'rotate(-1.5deg)' : 'none'}}>
      {lignes.map((l, i) => {
        const a = accroche ? i * 3 - 30 : i * 5;
        const sp = spring({frame: f - a, fps: FPS, config: {damping: 14, stiffness: 240}});
        const pair = i % 2 === 1;
        let span: any = {fontFamily: T.titre, fontWeight: T.titrePoids, fontSize: taille, lineHeight: 1, display: 'inline-block', textTransform: 'uppercase'};
        let texteL: string = l;
        if (T.nom === 'dossier') span = {...span, lineHeight: 0.95, color: '#fff', padding: pair ? '4px 26px 0' : 0, background: pair ? T.accent : 'transparent', ...(pair ? {} : ombre(10))};
        if (T.nom === 'neon') span = {...span, ...tube(pair ? T.accent : T.accent2)};
        if (T.nom === 'presse') span = {...span, textTransform: 'none', color: T.encre, background: T.papier, padding: '6px 28px 14px', boxShadow: '0 14px 30px rgba(0,0,0,0.5)', lineHeight: 1.05};
        if (T.nom === 'data') span = {...span, color: pair ? T.accent : '#fff', ...ombre(8), borderBottom: i === lignes.length - 1 ? `14px solid ${T.accent}` : 'none', paddingBottom: i === lignes.length - 1 ? 8 : 0};
        if (T.nom === 'terminal') {
          const n = Math.floor(interpolate(f, [accroche ? -30 : 2 + i * 8, (accroche ? -30 : 2 + i * 8) + l.length * 1.2], [0, l.length], CL));
          texteL = l.slice(0, n) + (n < l.length || Math.floor(f / 8) % 2 ? '█' : ' ');
          span = {...span, color: T.accent, background: 'rgba(0,0,0,0.78)', padding: '10px 24px', ...lueur('rgba(57,255,20,0.6)')};
        }
        return (
          <div key={i} style={{transform: T.nom === 'terminal' ? 'none' : `translateY(${(1 - sp) * 60}px) scale(${interpolate(sp, [0, 1], [1.25, 1])})`, opacity: T.nom === 'terminal' ? 1 : interpolate(sp, [0, 0.2], [0, 1], CL), marginTop: i ? (T.nom === 'presse' ? 14 : 10) : 0}}>
            <span style={span}>{texteL}</span>
          </div>
        );
      })}
    </div>
  );
};

// ---------- Lieu et date ----------
const Lieu: React.FC<{texte: string}> = ({texte}) => {
  const f = useCurrentFrame();
  const T = useT();
  const n = Math.floor(interpolate(f, [3, 3 + texte.length * 1.1], [0, texte.length], CL));
  const ent = interpolate(f, [0, 8], [0, 1], {...CL, easing: Easing.out(Easing.cubic)});
  const curseur = <span style={{opacity: Math.floor(f / 8) % 2 ? 0 : 1, color: T.accent}}>▌</span>;
  if (T.nom === 'neon') {
    const vacille = f < 14 ? (Math.floor(f / 2) % 3 === 0 ? 0.3 : 1) : 1;
    return (
      <div style={{position: 'absolute', top: 320, left: 0, width: 1080, display: 'flex', justifyContent: 'center', opacity: vacille}}>
        <div style={{border: `5px solid ${T.accent}`, borderRadius: 18, padding: '10px 30px 4px', boxShadow: `0 0 26px ${T.accent}, inset 0 0 18px ${T.accent}`, fontFamily: 'Bebas', fontSize: 72, letterSpacing: 4, color: '#fff', ...lueur(T.accent2)}}>{texte}</div>
      </div>
    );
  }
  if (T.nom === 'presse') {
    return (
      <div style={{position: 'absolute', top: 320, left: 70, transform: `translateX(${(1 - ent) * -400}px)`, background: T.papier, padding: '8px 22px', fontFamily: 'Presse', fontWeight: 900, fontSize: 46, color: T.encre, letterSpacing: 2, boxShadow: '0 10px 24px rgba(0,0,0,0.5)'}}>
        {texte.toUpperCase()} —
      </div>
    );
  }
  if (T.nom === 'data') {
    return (
      <div style={{position: 'absolute', top: 320, left: 70, transform: `scale(${ent})`, transformOrigin: 'left center', background: T.accent, borderRadius: 40, padding: '10px 30px', fontFamily: 'Mont', fontWeight: 900, fontSize: 44, color: '#000'}}>
        {texte}
      </div>
    );
  }
  if (T.nom === 'terminal') {
    return (
      <div style={{position: 'absolute', top: 320, left: 70, background: 'rgba(0,0,0,0.8)', padding: '12px 22px', fontFamily: 'Mono', fontSize: 44, color: T.accent, ...lueur('rgba(57,255,20,0.5)')}}>
        {'> '}{texte.slice(0, n)}{curseur}
      </div>
    );
  }
  return (
    <div style={{position: 'absolute', top: 330, left: 70, display: 'flex', alignItems: 'center'}}>
      <div style={{width: 16, height: 70, background: T.accent, marginRight: 22, transform: `scaleY(${ent})`}} />
      <div style={{background: 'rgba(0,0,0,0.72)', padding: '14px 26px', fontFamily: 'Machine', fontSize: 50, color: '#fff', letterSpacing: 2, whiteSpace: 'nowrap', opacity: ent}}>
        {texte.slice(0, n)}{curseur}
      </div>
    </div>
  );
};

// ---------- Document (preuve, conditions, liste) ----------
const Document: React.FC<{doc: any; dur: number}> = ({doc, dur}) => {
  const f = useCurrentFrame();
  const T = useT();
  const ent = spring({frame: f, fps: FPS, config: {damping: 16, stiffness: 180}});
  const lignes: string[] = doc.lignes || [];
  const pas = Math.max(6, Math.floor((dur * 0.55) / Math.max(1, lignes.length)));
  const tamponA = Math.round(dur * 0.62);
  const sp = spring({frame: f - tamponA, fps: FPS, config: {damping: 12, stiffness: 260}});
  const sombre = T.nom === 'terminal' || T.nom === 'neon' || T.nom === 'data';
  const police = T.nom === 'terminal' ? 'Mono' : sombre ? 'Mont' : 'Machine';
  const carte: any = T.nom === 'terminal'
    ? {background: 'rgba(2,8,2,0.92)', border: `3px solid ${T.accent}`, boxShadow: `0 0 30px rgba(57,255,20,0.35)`}
    : sombre ? {background: 'rgba(12,12,22,0.9)', border: `4px solid ${T.accent}`, borderRadius: 22, boxShadow: `0 0 36px ${T.accent}55`}
    : {background: T.papier, boxShadow: '0 30px 60px rgba(0,0,0,0.6)', backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0 2px, transparent 2px 40px)'};
  const encre = sombre ? '#fff' : '#141414';
  return (
    <div style={{position: 'absolute', top: 420, left: 110, width: 860, transform: `translateY(${(1 - ent) * 900}px) rotate(${sombre ? 0 : -2.5 + (1 - ent) * 6}deg)`}}>
      <div style={{...carte, padding: '40px 50px 52px'}}>
        {T.nom === 'terminal' ? <div style={{fontFamily: 'Mono', fontSize: 28, color: T.accent, marginBottom: 14}}>● ● ●  {doc.entete || 'fichier.txt'}</div>
          : <div style={{fontFamily: police, fontWeight: 800, fontSize: 32, color: sombre ? T.accent : '#7a6f60', letterSpacing: 3}}>{doc.entete || 'DOSSIER'}</div>}
        <div style={{fontFamily: T.nom === 'presse' ? 'Presse' : police, fontWeight: 900, fontSize: 60, color: T.nom === 'terminal' ? T.accent : encre, marginTop: 8, borderBottom: `4px solid ${T.nom === 'terminal' ? T.accent : sombre ? T.accent : '#141414'}`, paddingBottom: 12}}>{doc.titre}</div>
        {lignes.map((l, i) => {
          const a = 8 + i * pas;
          if (f < a) return null;
          const morceaux = l.split(/(\[\[[^\]]*\]\])/);
          return (
            <div key={i} style={{fontFamily: police, fontWeight: 800, fontSize: T.nom === 'terminal' ? 44 : 50, color: T.nom === 'terminal' ? '#D8FFD0' : encre, marginTop: 20, lineHeight: 1.15, opacity: interpolate(f - a, [0, 4], [0, 1], CL)}}>
              {T.nom === 'terminal' ? '> ' : sombre ? '• ' : ''}
              {morceaux.map((m, j) => m.startsWith('[[') ? (
                <span key={j} style={{background: sombre ? T.accent : '#111', color: sombre ? T.accent : '#111', padding: '0 6px'}}>{m.slice(2, -2)}</span>
              ) : <span key={j}>{m}</span>)}
            </div>
          );
        })}
      </div>
      {doc.tampon && f >= tamponA ? (
        <div style={{position: 'absolute', right: 30, bottom: -40, transform: `rotate(-14deg) scale(${Math.max(0.95, interpolate(sp, [0, 1], [2.6, 1]))})`, opacity: interpolate(sp, [0, 0.15], [0, 0.92], CL),
          border: `10px solid ${T.accent}`, outline: `4px solid ${T.accent}`, outlineOffset: 8, color: T.accent, fontFamily: T.nom === 'terminal' ? 'Mono' : 'Bebas', fontSize: T.nom === 'terminal' ? 80 : 120, padding: '4px 30px 0', letterSpacing: 6}}>
          {doc.tampon}
        </div>
      ) : null}
    </div>
  );
};

// ---------- Coupure de presse (source + date + titre réécrit, jamais de logo) ----------
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

// ---------- Chiffre qui défile ----------
const fmtNombre = (v: number, cible: number) => Number.isInteger(cible) ? Math.round(v).toLocaleString('fr-FR') : v.toFixed(1).replace('.', ',');
const Chiffre: React.FC<{c: any; top: number}> = ({c, top}) => {
  const f = useCurrentFrame();
  const T = useT();
  const p = interpolate(f, [2, 22], [0, 1], {...CL, easing: Easing.out(Easing.cubic)});
  const txt = (c.prefixe || '') + fmtNombre(c.valeur * p, c.valeur);
  const lab = spring({frame: f - 10, fps: FPS, config: {damping: 14, stiffness: 200}});
  const pop = f >= 22 ? interpolate(spring({frame: f - 22, fps: FPS, config: {damping: 9, stiffness: 250}}), [0, 1], [1.12, 1]) : 1;
  const police = T.nom === 'presse' ? 'Presse' : T.nom === 'data' ? 'Mont' : T.nom === 'terminal' ? 'Mono' : 'Bebas';
  const taille = T.nom === 'data' ? 230 : T.nom === 'terminal' ? 200 : T.nom === 'presse' ? 240 : 300;
  const style: any = T.nom === 'neon' ? tube(T.accent2)
    : T.nom === 'terminal' ? {color: T.accent, ...lueur('rgba(57,255,20,0.55)')} : {color: '#fff', ...ombre(12)};
  return (
    <div style={{position: 'absolute', top, left: 0, width: 1080, textAlign: 'center'}}>
      <div style={{fontFamily: police, fontWeight: 900, fontSize: taille, lineHeight: 0.95, transform: `scale(${pop})`}}>
        <span style={style}>{txt}</span><span style={{fontSize: taille * 0.55, color: T.nom === 'terminal' ? T.accent : T.nom === 'neon' ? T.accent2 : T.accent2 === '#FFD23F' ? '#FFD23F' : T.accent}}>{c.suffixe || ''}</span>
      </div>
      {T.nom === 'data' ? <div style={{margin: '18px auto 0', width: 760, height: 18, background: 'rgba(255,255,255,0.18)', borderRadius: 9}}><div style={{width: `${p * 100}%`, height: '100%', background: T.accent, borderRadius: 9}} /></div> : null}
      {c.label ? (
        <div style={{display: 'inline-block', marginTop: 18, background: T.nom === 'terminal' ? 'transparent' : T.accent, border: T.nom === 'terminal' ? `3px solid ${T.accent}` : 'none',
          color: T.nom === 'data' ? '#000' : T.nom === 'terminal' ? T.accent : '#fff', fontFamily: T.nom === 'terminal' ? 'Mono' : 'Mont', fontWeight: 900, fontSize: 48, padding: '10px 26px', transform: `scaleX(${lab})`, borderRadius: T.nom === 'data' || T.nom === 'neon' ? 14 : 0}}>{c.label}</div>
      ) : null}
    </div>
  );
};

// ---------- Liste (top 3) : le numéro qui claque, puis le titre de l'élément ----------
const Liste: React.FC<{l: any}> = ({l}) => {
  const f = useCurrentFrame();
  const T = useT();
  const sp = spring({frame: f, fps: FPS, config: {damping: 9, stiffness: 200}});
  const style: any = T.nom === 'neon' ? tube(T.accent)
    : T.nom === 'terminal' ? {color: T.accent, ...lueur('rgba(57,255,20,0.6)')} : {color: T.accent, ...contour(12), ...ombre(10)};
  return (
    <>
      <div style={{position: 'absolute', top: 330, left: 0, width: 1080, textAlign: 'center', transform: `translateX(${(1 - sp) * 900}px) rotate(${-6 + (1 - sp) * 30}deg)`}}>
        <span style={{fontFamily: T.nom === 'terminal' ? 'Mono' : T.nom === 'presse' ? 'Presse' : 'Bebas', fontWeight: 900, fontSize: 300, lineHeight: 1, ...style}}>
          {T.nom === 'presse' ? `N°${l.numero}` : `#${l.numero}`}
        </span>
      </div>
      {l.texte ? <Titre texte={l.texte} top={720} /> : null}
    </>
  );
};

// ---------- Duel : deux barres qui s'affrontent ----------
const Duel: React.FC<{d: any}> = ({d}) => {
  const f = useCurrentFrame();
  const T = useT();
  const g = d.gauche, dr = d.droite;
  const max = Math.max(g.valeur, dr.valeur) || 1;
  const p = interpolate(f, [6, 30], [0, 1], {...CL, easing: Easing.out(Easing.cubic)});
  const fini = f >= 32;
  const gagnant = g.valeur >= dr.valeur ? 0 : 1;
  const col = (c: any, k: number) => {
    const h = Math.max(14, 380 * (c.valeur / max)) * p;
    const teinte = k === 0 ? T.accent : T.accent2;
    const perd = fini && k !== gagnant;
    return (
      <div key={k} style={{position: 'absolute', left: k === 0 ? 110 : 590, width: 380, top: 0, height: 1240}}>
        <div style={{position: 'absolute', top: 470, width: 380, textAlign: 'center', fontFamily: 'Mont', fontWeight: 900, fontSize: 52, lineHeight: 1.08, color: '#fff', textTransform: 'uppercase', ...ombre(8)}}>{c.label}</div>
        <div style={{position: 'absolute', bottom: h + 26, width: 380, textAlign: 'center', fontFamily: T.nom === 'terminal' ? 'Mono' : T.nom === 'data' ? 'Mont' : 'Bebas', fontWeight: 900, fontSize: 104, color: perd ? '#8a8a8a' : teinte, ...ombre(10)}}>
          {(d.prefixe || '') + fmtNombre(c.valeur * p, c.valeur) + (d.suffixe || '')}
        </div>
        <div style={{position: 'absolute', top: 1240 - h, left: 60, width: 260, height: h, background: perd ? '#5d5d5d' : teinte, borderRadius: T.nom === 'data' || T.nom === 'neon' ? '18px 18px 0 0' : 0, boxShadow: !perd && fini ? `0 0 50px ${teinte}` : 'none'}} />
      </div>
    );
  };
  return (
    <>
      <AbsoluteFill style={{background: 'rgba(0,0,0,0.45)'}} />
      {col(g, 0)}
      {col(dr, 1)}
      <div style={{position: 'absolute', top: 1240, left: 80, width: 920, height: 8, background: '#fff', opacity: 0.8}} />
    </>
  );
};

// ---------- Frise : les dates apparaissent quand la voix les dit ----------
const Frise: React.FC<{fr: any; instants: number[]}> = ({fr, instants}) => {
  const f = useCurrentFrame();
  const T = useT();
  const et: any[] = fr.etapes || [];
  const pas = Math.min(250, 760 / Math.max(1, et.length - 1 || 1));
  return (
    <>
      <AbsoluteFill style={{background: 'rgba(0,0,0,0.45)'}} />
      <div style={{position: 'absolute', left: 168, top: 500, width: 8, height: pas * (et.length - 1) * interpolate(f, [0, Math.max(1, instants[instants.length - 1] || 1)], [0, 1], CL), background: T.accent}} />
      {et.map((e, k) => {
        const a = instants[k] ?? 0;
        if (f < a) return null;
        const sp = spring({frame: f - a, fps: FPS, config: {damping: 12, stiffness: 210}});
        const barre = !!e.barre;
        const trait = interpolate(f - a, [8, 16], [0, 1], CL);
        return (
          <div key={k} style={{position: 'absolute', top: 440 + k * pas, left: 140, width: 860, transform: `translateX(${(1 - sp) * 700}px)`}}>
            <div style={{position: 'absolute', left: 8, top: 36, width: 56, height: 56, borderRadius: 28, background: barre ? '#555' : T.accent, border: '6px solid #fff'}} />
            <div style={{marginLeft: 100, fontFamily: T.nom === 'terminal' ? 'Mono' : T.nom === 'presse' ? 'Presse' : 'Bebas', fontWeight: 900, fontSize: 124, lineHeight: 1, color: barre ? '#9a9a9a' : '#fff', position: 'relative', display: 'inline-block', ...ombre(8)}}>
              {e.date}
              {barre ? <div style={{position: 'absolute', left: -6, top: '48%', height: 10, width: `${trait * 104}%`, background: T.accent}} /> : null}
            </div>
            {e.texte ? <div style={{marginLeft: 100, marginTop: 2, fontFamily: 'Mont', fontWeight: 800, fontSize: 48, color: '#fff', ...ombre(6)}}>{e.texte}</div> : null}
          </div>
        );
      })}
    </>
  );
};

// ---------- Tampon plein écran ----------
const Tampon: React.FC<{texte: string; a: number}> = ({texte, a}) => {
  const f = useCurrentFrame();
  const T = useT();
  if (f < a) return null;
  const sp = spring({frame: f - a, fps: FPS, config: {damping: 12, stiffness: 280}});
  const police = T.nom === 'presse' ? 'Presse' : T.nom === 'data' ? 'Mont' : T.nom === 'terminal' ? 'Mono' : 'Bebas';
  return (
    <div style={{position: 'absolute', top: 780, left: 0, width: 1080, display: 'flex', justifyContent: 'center'}}>
      <div style={{transform: `rotate(-12deg) scale(${Math.max(0.95, interpolate(sp, [0, 1], [3, 1]))})`, opacity: interpolate(sp, [0, 0.12], [0, 0.95], CL),
        border: `14px solid ${T.accent}`, outline: `5px solid ${T.accent}`, outlineOffset: 10, color: T.accent, fontFamily: police, fontWeight: 900,
        fontSize: (texte.length > 10 ? 150 : 190) * (police === 'Bebas' ? 1 : 0.78), lineHeight: 0.92, textAlign: 'center', maxWidth: 860, padding: '14px 40px 4px', letterSpacing: police === 'Bebas' ? 6 : 1, background: 'rgba(0,0,0,0.25)',
        ...(T.nom === 'neon' || T.nom === 'terminal' ? lueur(T.accent) : {})}}>
        {texte}
      </div>
    </div>
  );
};

// ---------- Sous-titres : 1 à 3 mots, le mot dit en couleur ----------
const SousTitres: React.FC<{scenes: any[]; t: number}> = ({scenes, t}) => {
  const T = useT();
  const S = T.sousTitres;
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
  const base: any = {fontFamily: S.police, fontWeight: S.poids, fontSize: S.taille, lineHeight: 1.12, textAlign: 'center', textTransform: S.majuscules ? 'uppercase' : 'none'};
  const deco: any = S.mode === 'contour' ? {...contour(14), ...ombre(6)}
    : S.mode === 'glow' ? {...contour(8, '#16001f'), textShadow: '0 0 18px rgba(0,0,0,0.9)'}
    : S.mode === 'boite' ? {background: 'rgba(0,0,0,0.88)', padding: '10px 22px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone'}
    : S.mode === 'mono' ? {background: 'rgba(0,0,0,0.75)', padding: '8px 18px'}
    : ombre(9);
  return (
    <div style={{position: 'absolute', top: 1270, left: 60, width: 960, display: 'flex', justifyContent: 'center'}}>
      <div style={{transform: `scale(${pop})`, ...base, ...deco}}>
        {p.map((m: any, i: number) => {
          const actif = t >= m.debut - 0.03 && t < m.fin + 0.03;
          const mot = m.mot.replace(/[,;:]$/, '');
          const st: any = {display: 'inline-block', margin: '0 0.16em', color: actif ? S.actif : (T.nom === 'terminal' ? T.encre : '#fff')};
          if (actif && S.mode === 'glow') st.textShadow = `0 0 10px ${S.actif}`;
          if (actif && S.mode === 'boite') { st.color = '#fff'; st.borderBottom = `8px solid ${S.actif}`; }
          return <span key={i} style={st}>{mot}</span>;
        })}
      </div>
    </div>
  );
};

// ---------- Grain de film / lignes d'écran ----------
const Grain: React.FC = () => {
  const f = useCurrentFrame();
  const T = useT();
  const x = Math.floor(random(`gx${f}`) * 256), y = Math.floor(random(`gy${f}`) * 256);
  return (
    <>
      <AbsoluteFill style={{backgroundImage: `url(${staticFile('grain.png')})`, backgroundPosition: `${x}px ${y}px`, opacity: T.grain, pointerEvents: 'none'}} />
      {T.nom === 'terminal' ? <AbsoluteFill style={{background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 2px, transparent 2px, transparent 5px)'}} /> : null}
    </>
  );
};

// ---------- Scène ----------
const Scene: React.FC<{s: any; dur: number; idx: number; from: number}> = ({s, dur, idx, from}) => {
  const f = useCurrentFrame();
  const T = useT();
  const sec = idx > 0 && f < 6 && T.nom !== 'data' ? (f % 2 ? 10 : -10) * (1 - f / 6) : 0;
  const tamponA = s.tampon ? (s.tamponMot ? caler(s, from, [s.tamponMot], dur, 0.6, true)[0] : Math.round((s.tamponA ?? dur / FPS * 0.6) * FPS)) : 0;
  const choc = s.tampon && f >= tamponA && f < tamponA + 6 ? ((f - tamponA) % 2 ? 14 : -14) : 0;
  const plein = s.duel || s.frise;
  const voile = s.document || s.coupure ? 0.45 : s.gros || s.compteur || s.question || s.tampon || s.liste ? 0.22 : 0;
  return (
    <AbsoluteFill style={{transform: `translate(${sec + choc}px, ${-(sec + choc) * 0.4}px)`}}>
      <Fond segs={s.segments || [{type: '3d', plan: 'rue_neon', duree: dur}]} seed={s.seed || 11} idx={idx} />
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.7) 100%)'}} />
      {voile && !plein ? <AbsoluteFill style={{background: `rgba(0,0,0,${voile})`}} /> : null}
      {s.lieu ? <Lieu texte={s.lieu} /> : null}
      {s.gros ? <Titre texte={s.gros} top={idx === 0 ? 520 : 560} accroche={idx === 0} /> : null}
      {s.compteur ? <Chiffre c={s.compteur} top={520} /> : null}
      {s.document ? <Document doc={s.document} dur={dur} /> : null}
      {s.coupure ? <Coupure c={s.coupure} /> : null}
      {s.liste ? <Liste l={s.liste} /> : null}
      {s.duel ? <Duel d={s.duel} /> : null}
      {s.frise ? <Frise fr={s.frise} instants={caler(s, from, (s.frise.etapes || []).map((e: any) => e.date), dur, 0.75)} /> : null}
      {s.tampon ? <Tampon texte={s.tampon} a={tamponA} /> : null}
    </AbsoluteFill>
  );
};

export const Doc: React.FC<{story: any; timing: any}> = ({story, timing}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  if (!story || !timing) return null;
  const T = THEMES[story.theme] || THEMES.dossier;
  const scenes = story.scenes.map((s: any, i: number) => ({...s, mots: timing.scenes[i].mots, t0: timing.scenes[i].debut}));
  return (
    <ThemeCtx.Provider value={T}>
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
    </ThemeCtx.Provider>
  );
};
