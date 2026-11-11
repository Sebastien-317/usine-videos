import React from 'react';
import {Composition} from 'remotion';
import {Video, FPS} from './Video';
import {Viral} from './Viral';

// Le moteur ne connaît aucune vidéo en dur : storyboard + timing arrivent en props au rendu.
const duree = ({props}: any) => ({durationInFrames: props.timing ? Math.ceil(props.timing.duree * FPS) : 300});

export const Root: React.FC = () => (
  <>
    <Composition id="Video" component={Video as any} width={1080} height={1920} fps={FPS} durationInFrames={300}
      defaultProps={{story: null, timing: null} as any} calculateMetadata={duree} />
    <Composition id="Viral" component={Viral as any} width={1080} height={1920} fps={FPS} durationInFrames={300}
      defaultProps={{story: null, timing: null} as any} calculateMetadata={duree} />
  </>
);
