// Scritte del montaggio video disegnate nel browser: un'immagine trasparente a piena misura per ogni scritta.
// La stessa immagine fa da anteprima nello Studio e viene sovrapposta al video da FFmpeg sul server.

import { TEXT_SIZES, VIDEO_SIZES } from 'src/lib/studio/video';

const FONT_FAMILY = "'Montserrat Variable', 'Public Sans Variable', sans-serif";
const LINE_HEIGHT = 1.2;
const TEXT_WIDTH_RATIO = 0.84;
const CENTER_Y = { alto: 0.14, centro: 0.5, basso: 0.8 };

/** Divide il testo in righe che stanno nella larghezza data (a capo sulle parole e sugli a capo scritti). */
function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Canvas trasparente con la scritta già impaginata (riquadro, colore, posizione). */
export async function drawTextOverlay(text, videoSize) {
  const { width, height } = VIDEO_SIZES[videoSize];
  const fontSize = TEXT_SIZES[text.size];
  const font = `700 ${fontSize}px ${FONT_FAMILY}`;
  // Il font si scarica la prima volta: senza aspettare il canvas userebbe quello di riserva
  await document.fonts.load(font).catch(() => undefined);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = wrapLines(ctx, text.text, width * TEXT_WIDTH_RATIO);
  const lineHeight = fontSize * LINE_HEIGHT;
  const blockHeight = lines.length * lineHeight;
  const centerY = height * CENTER_Y[text.position];
  const top = Math.min(Math.max(centerY - blockHeight / 2, fontSize), height - blockHeight - fontSize);

  if (text.background) {
    const pad = fontSize * 0.35;
    const boxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
    ctx.fillStyle = text.background;
    ctx.beginPath();
    ctx.roundRect((width - boxWidth) / 2, top - pad, boxWidth, blockHeight + pad * 2, fontSize * 0.25);
    ctx.fill();
  } else {
    // Senza riquadro un'ombra leggera tiene leggibile il testo su qualsiasi video
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = fontSize * 0.25;
  }
  ctx.fillStyle = text.color;
  lines.forEach((l, i) => ctx.fillText(l, width / 2, top + lineHeight * (i + 0.5)));
  return canvas;
}

export const overlayBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
