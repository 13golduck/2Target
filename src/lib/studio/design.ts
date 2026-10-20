import { z } from "zod";

// Grafica dello Studio: una o più pagine (carosello) con livelli di testo, immagine, logo e forma.
// Le coordinate sono in pixel della misura finale (es. 1080×1350), così editor, AI ed esportazione
// parlano la stessa lingua. Funzioni pure, testate in design.test.ts.

export const DESIGN_SIZES = {
  quadrato: { width: 1080, height: 1080, label: "Quadrato 1:1" },
  verticale: { width: 1080, height: 1350, label: "Verticale 4:5" },
  storia: { width: 1080, height: 1920, label: "Storia o reel 9:16" },
} as const;
export type DesignSize = keyof typeof DESIGN_SIZES;

/** Font disponibili nell'editor (caricati dall'app, senza servizi esterni). */
export const DESIGN_FONTS = ["Public Sans Variable", "DM Sans Variable", "Inter Variable", "Montserrat Variable", "Oswald Variable", "Playfair Display Variable", "Lora Variable", "Barlow"] as const;

export const MAX_PAGES = 10;
export const MAX_LAYERS = 30;

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = z.string().regex(HEX, "Colore nel formato #RRGGBB");

const box = {
  id: z.string().min(1).max(40),
  x: z.number(),
  y: z.number(),
  width: z.number().min(1),
  height: z.number().min(1),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
};

export const TextLayerSchema = z.object({
  ...box,
  type: z.literal("testo"),
  text: z.string().max(600),
  fontFamily: z.enum(DESIGN_FONTS),
  fontSize: z.number().min(8).max(400),
  bold: z.boolean(),
  color: hex,
  align: z.enum(["left", "center", "right"]),
  /** Riquadro dietro al testo (null = nessuno). */
  background: hex.nullable(),
});

export const ImageLayerSchema = z.object({
  ...box,
  type: z.literal("immagine"),
  mediaId: z.number().int().positive().describe("Id di una foto del materiale"),
  fit: z.enum(["riempi", "contieni"]),
});

export const LogoLayerSchema = z.object({ ...box, type: z.literal("logo") });

export const ShapeLayerSchema = z.object({
  ...box,
  type: z.literal("forma"),
  shape: z.enum(["rettangolo", "cerchio"]),
  fill: hex,
  radius: z.number().min(0),
});

export const LayerSchema = z.discriminatedUnion("type", [TextLayerSchema, ImageLayerSchema, LogoLayerSchema, ShapeLayerSchema]);
export type Layer = z.infer<typeof LayerSchema>;

export const PageSchema = z.object({ id: z.string().min(1).max(40), background: hex, layers: z.array(LayerSchema).max(MAX_LAYERS) });
export type Page = z.infer<typeof PageSchema>;

export const DesignSchema = z.object({
  size: z.enum(Object.keys(DESIGN_SIZES) as [DesignSize, ...DesignSize[]]),
  pages: z.array(PageSchema).min(1).max(MAX_PAGES),
});
export type Design = z.infer<typeof DesignSchema>;

export const dimensions = (d: Pick<Design, "size">) => DESIGN_SIZES[d.size];

/** Identificativo breve e leggibile per livelli e pagine nuove. */
export const newId = (prefix: string, taken: Iterable<string>) => {
  const used = new Set(taken);
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
};

/**
 * Rende la grafica sicura da usare: toglie le immagini di file che non sono del progetto, rende unici gli id
 * e riporta dentro la pagina i livelli finiti fuori (almeno un angolo resta visibile).
 */
export function sanitizeDesign(design: Design, allowedMediaIds: readonly number[]): Design {
  const { width, height } = dimensions(design);
  const pageIds = new Set<string>();
  const pages = design.pages.slice(0, MAX_PAGES).map((page) => {
    const id = pageIds.has(page.id) ? newId("p", pageIds) : page.id;
    pageIds.add(id);
    const layerIds = new Set<string>();
    const layers = page.layers
      .filter((l) => l.type !== "immagine" || allowedMediaIds.includes(l.mediaId))
      .slice(0, MAX_LAYERS)
      .map((l) => {
        const lid = layerIds.has(l.id) ? newId("l", layerIds) : l.id;
        layerIds.add(lid);
        const w = Math.min(l.width, width * 2);
        const h = Math.min(l.height, height * 2);
        return { ...l, id: lid, width: w, height: h, x: clamp(l.x, -w + 20, width - 20), y: clamp(l.y, -h + 20, height - 20) };
      });
    return { ...page, id, layers };
  });
  return { ...design, pages };
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

export type BrandColors = { background: string; text: string; accent: string };

/** Colori di partenza dal brand kit del cliente (con valori neutri se il kit manca o è incompleto). */
export function brandColors(palette: { hex: string; role: string }[] | undefined): BrandColors {
  const valid = (palette ?? []).filter((c) => HEX.test(c.hex));
  const byRole = (re: RegExp) => valid.find((c) => re.test(c.role.toLowerCase()))?.hex;
  return {
    background: byRole(/sfondo|background/) ?? "#FFFFFF",
    text: byRole(/testo|text/) ?? "#1C252E",
    accent: byRole(/primario|accento|accent|primary/) ?? valid[0]?.hex ?? "#CDA434",
  };
}

/** Grafica di partenza: titolo e logo sui colori del cliente; una pagina per ogni slide del carosello. */
export function starterDesign(o: { size: DesignSize; pages: number; headline: string; colors: BrandColors; hasLogo: boolean }): Design {
  const { width, height } = DESIGN_SIZES[o.size];
  const margin = Math.round(width * 0.08);
  const pages = Array.from({ length: clamp(o.pages, 1, MAX_PAGES) }, (_, i): Page => ({
    id: `p${i + 1}`,
    background: o.colors.background,
    layers: [
      { id: "l1", type: "forma", shape: "rettangolo", x: 0, y: height - Math.round(height * 0.04), width, height: Math.round(height * 0.04), rotation: 0, opacity: 1, fill: o.colors.accent, radius: 0 },
      {
        id: "l2",
        type: "testo",
        text: i === 0 ? o.headline : "",
        x: margin,
        y: Math.round(height * 0.35),
        width: width - margin * 2,
        height: Math.round(height * 0.3),
        rotation: 0,
        opacity: 1,
        fontFamily: "Montserrat Variable",
        fontSize: Math.round(width * 0.075),
        bold: true,
        color: o.colors.text,
        align: "left",
        background: null,
      },
      ...(o.hasLogo ? [{ id: "l3", type: "logo" as const, x: width - margin - 140, y: margin, width: 140, height: 140, rotation: 0, opacity: 1 }] : []),
    ],
  }));
  return { size: o.size, pages };
}

/** Mette l'immagine come sfondo a tutta pagina (sotto agli altri livelli) nella pagina indicata, se esiste. */
export function placeAsBackground(design: Design, page: number, mediaId: number): Design {
  const index = page - 1;
  if (index < 0 || index >= design.pages.length) return design;
  const { width, height } = DESIGN_SIZES[design.size];
  return {
    ...design,
    pages: design.pages.map((p, i) => {
      if (i !== index) return p;
      const id = newId("l", p.layers.map((l) => l.id));
      return { ...p, layers: [{ id, type: "immagine" as const, mediaId, fit: "riempi" as const, x: 0, y: 0, width, height, rotation: 0, opacity: 1 }, ...p.layers] };
    }),
  };
}
