// Rendu d'une vidéo à partir d'un storyboard + timing.
// node render.mjs storyboard.json timing.json sortie.mp4            -> vidéo muette
// node render.mjs storyboard.json timing.json dossier/ --stills 0.5,5.2   -> images de contrôle
import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';

const [storyPath, timingPath, out, flag, list] = process.argv.slice(2);
const inputProps = {
  story: JSON.parse(fs.readFileSync(storyPath, 'utf8')),
  timing: JSON.parse(fs.readFileSync(timingPath, 'utf8')),
};
const browserExecutable = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const chromiumOptions = {gl: 'swangle'};
const id = inputProps.story.composition || 'Video';
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), publicDir: path.resolve('public')});
const composition = await selectComposition({serveUrl, id, inputProps, browserExecutable, chromiumOptions});

if (flag === '--stills') {
  fs.mkdirSync(out, {recursive: true});
  for (const s of list.split(',')) {
    const frame = Math.min(Math.round(parseFloat(s) * 30), composition.durationInFrames - 1);
    await renderStill({composition, serveUrl, inputProps, browserExecutable, chromiumOptions, frame, output: path.join(out, `t${s}.jpg`), imageFormat: 'jpeg', jpegQuality: 88});
    console.log('still', s);
  }
} else {
  const t0 = Date.now();
  await renderMedia({
    composition, serveUrl, inputProps, browserExecutable, chromiumOptions, codec: 'h264', crf: inputProps.story.composition === 'Viral' ? 21 : 18, x264Preset: 'veryfast',
    outputLocation: out, concurrency: 2, muted: true,
    onProgress: ({progress}) => { if (Math.round(progress * 100) % 20 === 0) process.stdout.write(`${Math.round(progress * 100)}% `); },
  });
  console.log(`\nrendu en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
