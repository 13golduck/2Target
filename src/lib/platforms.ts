// Piattaforme di pubblicazione e canali: nome, icona e colore in un posto solo (server e interfaccia).
// Aggiungere una piattaforma qui la fa comparire con lo stesso nome in schede, calendario, report e avvisi.

export type PlatformInfo = { label: string; icon: string; color: string };

export const PLATFORM_INFO: Record<string, PlatformInfo> = {
  instagram: { label: "Instagram", icon: "socials:instagram", color: "#E1306C" },
  facebook: { label: "Facebook", icon: "socials:facebook", color: "#1877F2" },
  tiktok: { label: "TikTok", icon: "socials:tiktok", color: "#000000" },
  linkedin: { label: "LinkedIn", icon: "socials:linkedin", color: "#0A66C2" },
  youtube: { label: "YouTube", icon: "socials:youtube", color: "#FF0000" },
  threads: { label: "Threads", icon: "socials:threads", color: "#000000" },
  pinterest: { label: "Pinterest", icon: "socials:pinterest", color: "#E60023" },
  business_profile: { label: "Scheda Google", icon: "socials:google", color: "#4285F4" },
  newsletter: { label: "Newsletter", icon: "solar:letter-bold", color: "#637381" },
};

export const platformName = (p: string) => PLATFORM_INFO[p]?.label ?? p;
