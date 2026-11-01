// Mini-vidéos muettes de NoSleep.js (module CommonJS : { webm, mp4 } en data: URI).
declare module 'nosleep.js/src/media.js' {
  const media: { webm: string; mp4: string };
  export default media;
}
