import { describe, expect, it } from "vitest";

import { conversionArgs, conversionReasons, parseProbe, slideshowArgs } from "../media-video";

// Uscite reali di `ffmpeg -i` (FFmpeg 6) su video di prova
const VERTICAL_OK = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':
  Duration: 00:00:04.00, start: 0.000000, bitrate: 241 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1080x1920 [SAR 1:1 DAR 9:16], 160 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)`;

const MOV_4K = `  Duration: 00:01:03.50, start: 0.000000, bitrate: 42642 kb/s
  Stream #0:0[0x1]: Video: hevc (Main 10) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67), 3840x2160, 42000 kb/s, 59.94 fps, 59.94 tbr, 600 tbn (default)
      displaymatrix: rotation of -90.00 degrees
  Stream #0:1[0x2]: Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 191 kb/s (default)`;

const NO_AUDIO_MPEG4 = `  Duration: 00:00:03.00, start: 0.000000, bitrate: 729 kb/s
  Stream #0:0[0x1](und): Video: mpeg4 (Simple Profile) (mp4v / 0x7634706D), yuv420p, 1280x720 [SAR 1:1 DAR 16:9], 725 kb/s, 25 fps, 25 tbr, 12800 tbn (default)`;

describe("lettura delle informazioni del video", () => {
  it("video verticale già adatto", () => {
    expect(parseProbe(VERTICAL_OK)).toEqual({ durationSec: 4, width: 1080, height: 1920, videoCodec: "h264", pixelFormat: "yuv420p", fps: 30, audioCodec: "aac", bitrateKbps: 241 });
  });

  it("iPhone 4K HEVC girato in verticale: la rotazione scambia larghezza e altezza", () => {
    const p = parseProbe(MOV_4K);
    expect(p).toMatchObject({ durationSec: 63.5, width: 2160, height: 3840, videoCodec: "hevc", pixelFormat: "yuv420p10le", fps: 59.94, bitrateKbps: 42642 });
  });

  it("video senza audio", () => {
    expect(parseProbe(NO_AUDIO_MPEG4)).toMatchObject({ videoCodec: "mpeg4", audioCodec: null, width: 1280, height: 720 });
  });
});

describe("quando convertire", () => {
  it("MP4 H.264/AAC in 1080×1920 va bene così", () => {
    expect(conversionReasons(parseProbe(VERTICAL_OK), "video/mp4")).toEqual([]);
  });

  it("MOV HEVC 4K a 10 bit e 42 Mbps: tutti i motivi", () => {
    const r = conversionReasons(parseProbe(MOV_4K), "video/quicktime");
    expect(r).toEqual(["formato non MP4", "codifica HEVC invece di H.264", "colori yuv420p10le", "risoluzione 2160×3840", "file troppo pesante (43 Mbps)"]);
  });

  it("codifica MPEG-4 vecchia", () => {
    expect(conversionReasons(parseProbe(NO_AUDIO_MPEG4), "video/mp4")).toEqual(["codifica MPEG4 invece di H.264"]);
  });
});

describe("argomenti di conversione", () => {
  it("H.264 + AAC, faststart, ridimensionamento con dimensioni pari", () => {
    const a = conversionArgs("in.mov", "out.mp4", parseProbe(MOV_4K));
    expect(a.slice(0, 4)).toEqual(["-hide_banner", "-y", "-i", "in.mov"]);
    expect(a[a.indexOf("-c:v") + 1]).toBe("libx264");
    expect(a[a.indexOf("-c:a") + 1]).toBe("aac");
    expect(a[a.indexOf("-pix_fmt") + 1]).toBe("yuv420p");
    expect(a[a.indexOf("-movflags") + 1]).toBe("+faststart");
    expect(a[a.indexOf("-vf") + 1]).toContain("min(1080,iw)");
    expect(a[a.indexOf("-vf") + 1]).toContain("trunc(iw/2)*2");
    expect(a.at(-1)).toBe("out.mp4");
  });
});

describe("video da slide", () => {
  it("tre slide: ingressi, due dissolvenze con offset cumulati, uscita verticale H.264", () => {
    const a = slideshowArgs(["a.png", "b.png", "c.png"], "out.mp4", 3, 0.5);
    expect(a.filter((x) => x === "-i")).toHaveLength(3);
    const fc = a[a.indexOf("-filter_complex") + 1];
    expect(fc).toContain("[v0][v1]xfade=transition=fade:duration=0.5:offset=2.50[x1]");
    expect(fc).toContain("[x1][v2]xfade=transition=fade:duration=0.5:offset=5.00[vout]");
    expect(fc).toContain("scale=1080:1920");
    expect(a.at(-1)).toBe("out.mp4");
  });
  it("una sola slide e nessuna slide", () => {
    expect(slideshowArgs(["a.png"], "o.mp4")[slideshowArgs(["a.png"], "o.mp4").indexOf("-filter_complex") + 1]).toContain("[v0]null[vout]");
    expect(() => slideshowArgs([], "o.mp4")).toThrow();
  });
});
