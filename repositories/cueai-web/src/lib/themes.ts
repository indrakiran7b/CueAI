/**
 * Colour palettes layered on top of the existing light/dark mode. "default" is the established CueAI look
 * (no data-palette attribute); every other palette defines explicit tokens for both modes so text and
 * controls keep readable contrast. Components consume the semantic CSS variables, never these hex values.
 */

export type ColorMode = "light" | "dark";

export const PALETTE_IDS = [
  "mocha-luxe",
  "ivory-editorial",
  "neon-pulse",
  "aubergine-frost",
  "mocha-serenity",
  "crimson-steel",
  "amethyst-voltage",
  "sage-hearth",
  "pine-lilac",
  "primary-pop",
] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];
export type PalettePreference = PaletteId | "default";
export const DEFAULT_PALETTE: PalettePreference = "default";

export type PaletteTokens = {
  background: string;
  backgroundElevated: string;
  foreground: string;
  foregroundMuted: string;
  foregroundSubtle: string;
  surface: string;
  surfaceSolid: string;
  surfaceHover: string;
  surfaceActive: string;
  border: string;
  borderStrong: string;
  borderGlow: string;
  glass: string;
  glassStrong: string;
  overlay: string;
  /** Navigation / selected text and primary brand surfaces. */
  primary: string;
  primaryForeground: string;
  /** Selected-state background (nav items, chips). */
  primaryMuted: string;
  /** Links and inline emphasis; must be readable as text on background. */
  accent: string;
  accentMuted: string;
  accentBorder: string;
  /** Primary action buttons. */
  cta: string;
  ctaForeground: string;
  ring: string;
  selection: string;
  selectionForeground: string;
  aurora: [string, string, string];
  successFg: string;
  warningFg: string;
  dangerFg: string;
  /** Categorical series colours, chosen to stay distinguishable from each other. */
  chart: [string, string, string, string, string];
  chartTick: string;
};

export type PaletteDefinition = {
  id: PaletteId;
  name: string;
  description: string;
  /** The three requested brand colours, in the order given in the brief. */
  brand: [{ name: string; hex: string }, { name: string; hex: string }, { name: string; hex: string }];
  /** Mode the palette was designed around. Shown as a hint only; the user's light/dark choice always wins. */
  preferredMode: ColorMode;
  modes: Record<ColorMode, PaletteTokens>;
};

const STATUS_LIGHT = { successFg: "#166534", warningFg: "#92400e", dangerFg: "#b91c1c" };
const STATUS_DARK = { successFg: "#4ade80", warningFg: "#fbbf24", dangerFg: "#f87171" };

export const PALETTES: PaletteDefinition[] = [
  {
    id: "mocha-luxe",
    name: "Mocha Luxe",
    description: "Warm and luxurious: mocha surfaces, champagne highlights, burnt-amber actions.",
    brand: [
      { name: "Mocha Brown", hex: "#5B4632" },
      { name: "Champagne Gold", hex: "#F4D9A0" },
      { name: "Burnt Amber", hex: "#C8792C" },
    ],
    preferredMode: "dark",
    modes: {
      light: {
        background: "#F7F2EA", backgroundElevated: "#FFFDF9",
        foreground: "#2A2119", foregroundMuted: "#65533F", foregroundSubtle: "#8A7764",
        surface: "rgba(255, 253, 249, 0.84)", surfaceSolid: "#FFFDF9",
        surfaceHover: "rgba(91, 70, 50, 0.06)", surfaceActive: "rgba(91, 70, 50, 0.11)",
        border: "#E6DACB", borderStrong: "rgba(91, 70, 50, 0.24)", borderGlow: "rgba(200, 121, 44, 0.35)",
        glass: "rgba(255, 253, 249, 0.82)", glassStrong: "rgba(255, 253, 249, 0.94)", overlay: "rgba(42, 33, 25, 0.42)",
        primary: "#5B4632", primaryForeground: "#FFF8EC", primaryMuted: "rgba(244, 217, 160, 0.55)",
        accent: "#8F5318", accentMuted: "rgba(200, 121, 44, 0.14)", accentBorder: "rgba(200, 121, 44, 0.38)",
        cta: "#C8792C", ctaForeground: "#1F1408",
        ring: "#8F5318", selection: "rgba(200, 121, 44, 0.28)", selectionForeground: "#2A2119",
        aurora: ["rgba(244, 217, 160, 0.38)", "rgba(200, 121, 44, 0.10)", "rgba(91, 70, 50, 0.05)"],
        ...STATUS_LIGHT,
        chart: ["#5B4632", "#B86A22", "#94742A", "#5F7A45", "#2F6688"],
        chartTick: "#7A6754",
      },
      dark: {
        background: "#17110C", backgroundElevated: "#211912",
        foreground: "#F7EFE3", foregroundMuted: "#C9B9A4", foregroundSubtle: "#97856F",
        surface: "rgba(37, 28, 20, 0.78)", surfaceSolid: "#271E16",
        surfaceHover: "rgba(244, 217, 160, 0.07)", surfaceActive: "rgba(244, 217, 160, 0.12)",
        border: "#3A2E22", borderStrong: "rgba(244, 217, 160, 0.20)", borderGlow: "rgba(244, 217, 160, 0.26)",
        glass: "rgba(37, 28, 20, 0.78)", glassStrong: "rgba(37, 28, 20, 0.92)", overlay: "rgba(0, 0, 0, 0.62)",
        primary: "#F4D9A0", primaryForeground: "#2A2119", primaryMuted: "rgba(244, 217, 160, 0.13)",
        accent: "#E5A15B", accentMuted: "rgba(200, 121, 44, 0.18)", accentBorder: "rgba(229, 161, 91, 0.40)",
        cta: "#C8792C", ctaForeground: "#17110C",
        ring: "#E5A15B", selection: "rgba(200, 121, 44, 0.38)", selectionForeground: "#FFF8EC",
        aurora: ["rgba(244, 217, 160, 0.07)", "rgba(200, 121, 44, 0.10)", "rgba(91, 70, 50, 0.20)"],
        ...STATUS_DARK,
        chart: ["#F4D9A0", "#E08A3A", "#A88B6C", "#93B67D", "#72AACB"],
        chartTick: "#97856F",
      },
    },
  },
  {
    id: "ivory-editorial",
    name: "Ivory Editorial",
    description: "Clean and editorial: warm ivory pages, deep blue navigation, coral calls to action.",
    brand: [
      { name: "Warm Ivory", hex: "#EAE6DE" },
      { name: "Deep Editorial Blue", hex: "#226192" },
      { name: "Coral Orange", hex: "#FF7F50" },
    ],
    preferredMode: "light",
    modes: {
      light: {
        background: "#EAE6DE", backgroundElevated: "#F7F4EF",
        foreground: "#18212C", foregroundMuted: "#4A5562", foregroundSubtle: "#6C7581",
        surface: "rgba(247, 244, 239, 0.86)", surfaceSolid: "#F7F4EF",
        surfaceHover: "rgba(34, 97, 146, 0.06)", surfaceActive: "rgba(34, 97, 146, 0.11)",
        border: "#D5CEC1", borderStrong: "rgba(24, 33, 44, 0.20)", borderGlow: "rgba(34, 97, 146, 0.30)",
        glass: "rgba(247, 244, 239, 0.84)", glassStrong: "rgba(247, 244, 239, 0.95)", overlay: "rgba(24, 33, 44, 0.40)",
        primary: "#226192", primaryForeground: "#FFFFFF", primaryMuted: "rgba(34, 97, 146, 0.12)",
        accent: "#1D5683", accentMuted: "rgba(255, 127, 80, 0.16)", accentBorder: "rgba(255, 127, 80, 0.45)",
        cta: "#FF7F50", ctaForeground: "#18212C",
        ring: "#226192", selection: "rgba(255, 127, 80, 0.30)", selectionForeground: "#18212C",
        aurora: ["rgba(255, 255, 255, 0.45)", "rgba(34, 97, 146, 0.07)", "rgba(255, 127, 80, 0.06)"],
        ...STATUS_LIGHT,
        chart: ["#226192", "#D0542A", "#2E8B7E", "#7B5BA8", "#957410"],
        chartTick: "#5F6A76",
      },
      dark: {
        background: "#111820", backgroundElevated: "#18212B",
        foreground: "#EFEBE4", foregroundMuted: "#ADB5BF", foregroundSubtle: "#7B8590",
        surface: "rgba(27, 36, 47, 0.80)", surfaceSolid: "#1C2530",
        surfaceHover: "rgba(234, 230, 222, 0.06)", surfaceActive: "rgba(234, 230, 222, 0.11)",
        border: "#2B3643", borderStrong: "rgba(234, 230, 222, 0.17)", borderGlow: "rgba(127, 179, 224, 0.32)",
        glass: "rgba(27, 36, 47, 0.80)", glassStrong: "rgba(27, 36, 47, 0.93)", overlay: "rgba(0, 0, 0, 0.60)",
        primary: "#8DBDE6", primaryForeground: "#0E1620", primaryMuted: "rgba(141, 189, 230, 0.14)",
        accent: "#8DBDE6", accentMuted: "rgba(255, 127, 80, 0.16)", accentBorder: "rgba(255, 127, 80, 0.45)",
        cta: "#FF7F50", ctaForeground: "#1A1410",
        ring: "#FF9B76", selection: "rgba(255, 127, 80, 0.35)", selectionForeground: "#FFFFFF",
        aurora: ["rgba(234, 230, 222, 0.04)", "rgba(34, 97, 146, 0.16)", "rgba(255, 127, 80, 0.05)"],
        ...STATUS_DARK,
        chart: ["#8DBDE6", "#FF8A5E", "#5CC2B2", "#B69DE2", "#E3C35A"],
        chartTick: "#7B8590",
      },
    },
  },
  {
    id: "neon-pulse",
    name: "Neon Pulse",
    description: "Bold and futuristic: jet-black canvas, cerulean controls, neon-rose focus and emphasis.",
    brand: [
      { name: "Jet Black", hex: "#0A0A0A" },
      { name: "Cerulean Blue", hex: "#007BA7" },
      { name: "Neon Rose", hex: "#FF2D95" },
    ],
    preferredMode: "dark",
    modes: {
      light: {
        background: "#F3F5F7", backgroundElevated: "#FFFFFF",
        foreground: "#0A0A0A", foregroundMuted: "#4A545E", foregroundSubtle: "#6B757F",
        surface: "rgba(255, 255, 255, 0.86)", surfaceSolid: "#FFFFFF",
        surfaceHover: "rgba(0, 123, 167, 0.07)", surfaceActive: "rgba(0, 123, 167, 0.12)",
        border: "#DCE1E6", borderStrong: "rgba(10, 10, 10, 0.16)", borderGlow: "rgba(0, 123, 167, 0.32)",
        glass: "rgba(255, 255, 255, 0.84)", glassStrong: "rgba(255, 255, 255, 0.95)", overlay: "rgba(10, 10, 10, 0.40)",
        primary: "#0A0A0A", primaryForeground: "#FFFFFF", primaryMuted: "rgba(0, 123, 167, 0.11)",
        accent: "#00698F", accentMuted: "rgba(0, 123, 167, 0.10)", accentBorder: "rgba(0, 123, 167, 0.32)",
        cta: "#007BA7", ctaForeground: "#FFFFFF",
        ring: "#C8006A", selection: "rgba(255, 45, 149, 0.22)", selectionForeground: "#0A0A0A",
        aurora: ["rgba(0, 123, 167, 0.06)", "rgba(255, 45, 149, 0.05)", "rgba(10, 10, 10, 0.03)"],
        ...STATUS_LIGHT,
        chart: ["#007BA7", "#D4157A", "#4D7C0F", "#B7791F", "#6D28D9"],
        chartTick: "#5E6873",
      },
      dark: {
        background: "#0A0A0A", backgroundElevated: "#121315",
        foreground: "#F2F5F7", foregroundMuted: "#9DA6AE", foregroundSubtle: "#6E767E",
        surface: "rgba(20, 22, 25, 0.78)", surfaceSolid: "#15171A",
        surfaceHover: "rgba(0, 123, 167, 0.12)", surfaceActive: "rgba(0, 123, 167, 0.18)",
        border: "#23272C", borderStrong: "rgba(255, 255, 255, 0.14)", borderGlow: "rgba(42, 169, 216, 0.45)",
        glass: "rgba(20, 22, 25, 0.78)", glassStrong: "rgba(20, 22, 25, 0.92)", overlay: "rgba(0, 0, 0, 0.70)",
        primary: "#2AA9D8", primaryForeground: "#04121A", primaryMuted: "rgba(0, 123, 167, 0.20)",
        accent: "#2AA9D8", accentMuted: "rgba(255, 45, 149, 0.12)", accentBorder: "rgba(255, 45, 149, 0.40)",
        cta: "#007BA7", ctaForeground: "#FFFFFF",
        ring: "#FF2D95", selection: "rgba(255, 45, 149, 0.38)", selectionForeground: "#FFFFFF",
        aurora: ["rgba(0, 123, 167, 0.12)", "rgba(255, 45, 149, 0.07)", "rgba(42, 169, 216, 0.05)"],
        ...STATUS_DARK,
        chart: ["#2AA9D8", "#FF2D95", "#A3E635", "#FBBF24", "#A78BFA"],
        chartTick: "#6E767E",
      },
    },
  },
  {
    id: "aubergine-frost",
    name: "Aubergine Frost",
    description: "Cool and distinctive: ice-silver surfaces, deep aubergine branding, marigold highlights.",
    brand: [
      { name: "Ice Silver", hex: "#DDE3E8" },
      { name: "Deep Aubergine", hex: "#3A0F34" },
      { name: "Marigold", hex: "#EAAA00" },
    ],
    preferredMode: "light",
    modes: {
      light: {
        background: "#DDE3E8", backgroundElevated: "#F1F4F7",
        foreground: "#1E0F1C", foregroundMuted: "#463F4C", foregroundSubtle: "#665F6C",
        surface: "rgba(241, 244, 247, 0.86)", surfaceSolid: "#F1F4F7",
        surfaceHover: "rgba(58, 15, 52, 0.06)", surfaceActive: "rgba(58, 15, 52, 0.11)",
        border: "#C7CFD7", borderStrong: "rgba(30, 15, 28, 0.20)", borderGlow: "rgba(234, 170, 0, 0.40)",
        glass: "rgba(241, 244, 247, 0.84)", glassStrong: "rgba(241, 244, 247, 0.95)", overlay: "rgba(30, 15, 28, 0.42)",
        primary: "#3A0F34", primaryForeground: "#FFFFFF", primaryMuted: "rgba(58, 15, 52, 0.10)",
        accent: "#5E1F55", accentMuted: "rgba(234, 170, 0, 0.18)", accentBorder: "rgba(234, 170, 0, 0.50)",
        cta: "#EAAA00", ctaForeground: "#1E0F1C",
        ring: "#3A0F34", selection: "rgba(234, 170, 0, 0.35)", selectionForeground: "#1E0F1C",
        aurora: ["rgba(255, 255, 255, 0.40)", "rgba(58, 15, 52, 0.06)", "rgba(234, 170, 0, 0.07)"],
        ...STATUS_LIGHT,
        chart: ["#3A0F34", "#9A6F00", "#2F7F9E", "#B4436C", "#4F7F32"],
        chartTick: "#5A5360",
      },
      dark: {
        background: "#190B17", backgroundElevated: "#231220",
        foreground: "#EEF1F4", foregroundMuted: "#BCB1BB", foregroundSubtle: "#88798A",
        surface: "rgba(40, 21, 37, 0.80)", surfaceSolid: "#2A1627",
        surfaceHover: "rgba(221, 227, 232, 0.06)", surfaceActive: "rgba(221, 227, 232, 0.11)",
        border: "#3D2439", borderStrong: "rgba(221, 227, 232, 0.17)", borderGlow: "rgba(234, 170, 0, 0.35)",
        glass: "rgba(40, 21, 37, 0.80)", glassStrong: "rgba(40, 21, 37, 0.93)", overlay: "rgba(0, 0, 0, 0.62)",
        primary: "#DDE3E8", primaryForeground: "#3A0F34", primaryMuted: "rgba(221, 227, 232, 0.11)",
        accent: "#F2C14E", accentMuted: "rgba(234, 170, 0, 0.15)", accentBorder: "rgba(242, 193, 78, 0.42)",
        cta: "#EAAA00", ctaForeground: "#190B17",
        ring: "#F2C14E", selection: "rgba(234, 170, 0, 0.35)", selectionForeground: "#FFFFFF",
        aurora: ["rgba(221, 227, 232, 0.04)", "rgba(234, 170, 0, 0.06)", "rgba(58, 15, 52, 0.30)"],
        ...STATUS_DARK,
        chart: ["#DDE3E8", "#EAAA00", "#6CC3E0", "#E57FA8", "#9BD17A"],
        chartTick: "#88798A",
      },
    },
  },
  {
    id: "mocha-serenity",
    name: "Mocha Serenity",
    description: "Calm and modern: platinum surfaces, mocha controls, pale-lavender secondary panels.",
    brand: [
      { name: "Mocha Brown", hex: "#6F4E37" },
      { name: "Platinum Silver", hex: "#E5E4E2" },
      { name: "Pale Lavender", hex: "#E6E0F0" },
    ],
    preferredMode: "light",
    modes: {
      light: {
        background: "#E5E4E2", backgroundElevated: "#F4F3F1",
        foreground: "#2B211A", foregroundMuted: "#5A4C43", foregroundSubtle: "#7A6E66",
        surface: "rgba(244, 243, 241, 0.86)", surfaceSolid: "#F4F3F1",
        surfaceHover: "rgba(111, 78, 55, 0.06)", surfaceActive: "rgba(111, 78, 55, 0.11)",
        border: "#D2D0CC", borderStrong: "rgba(43, 33, 26, 0.18)", borderGlow: "rgba(111, 78, 55, 0.30)",
        glass: "rgba(244, 243, 241, 0.84)", glassStrong: "rgba(244, 243, 241, 0.95)", overlay: "rgba(43, 33, 26, 0.40)",
        primary: "#6F4E37", primaryForeground: "#FFFFFF", primaryMuted: "#E6E0F0",
        accent: "#594888", accentMuted: "rgba(230, 224, 240, 0.85)", accentBorder: "rgba(89, 72, 136, 0.30)",
        cta: "#6F4E37", ctaForeground: "#FFFFFF",
        ring: "#6F4E37", selection: "rgba(111, 78, 55, 0.22)", selectionForeground: "#2B211A",
        aurora: ["rgba(230, 224, 240, 0.55)", "rgba(111, 78, 55, 0.06)", "rgba(255, 255, 255, 0.30)"],
        ...STATUS_LIGHT,
        chart: ["#6F4E37", "#7D68B8", "#3F7E7F", "#B0723F", "#5F8A3D"],
        chartTick: "#6E625A",
      },
      dark: {
        background: "#181412", backgroundElevated: "#211C19",
        foreground: "#EFEDEA", foregroundMuted: "#BFB7B0", foregroundSubtle: "#8C837C",
        surface: "rgba(38, 32, 28, 0.80)", surfaceSolid: "#28221E",
        surfaceHover: "rgba(230, 224, 240, 0.07)", surfaceActive: "rgba(230, 224, 240, 0.12)",
        border: "#38302B", borderStrong: "rgba(229, 228, 226, 0.17)", borderGlow: "rgba(230, 224, 240, 0.26)",
        glass: "rgba(38, 32, 28, 0.80)", glassStrong: "rgba(38, 32, 28, 0.93)", overlay: "rgba(0, 0, 0, 0.62)",
        primary: "#E6E0F0", primaryForeground: "#2B211A", primaryMuted: "rgba(230, 224, 240, 0.12)",
        accent: "#C9B8E8", accentMuted: "rgba(230, 224, 240, 0.10)", accentBorder: "rgba(201, 184, 232, 0.36)",
        cta: "#A97F62", ctaForeground: "#181412",
        ring: "#C9B8E8", selection: "rgba(201, 184, 232, 0.32)", selectionForeground: "#FFFFFF",
        aurora: ["rgba(230, 224, 240, 0.06)", "rgba(111, 78, 55, 0.14)", "rgba(229, 228, 226, 0.03)"],
        ...STATUS_DARK,
        chart: ["#E6E0F0", "#C49A78", "#7FB7B8", "#B39DDB", "#A8C686"],
        chartTick: "#8C837C",
      },
    },
  },
  {
    id: "crimson-steel",
    name: "Crimson Steel",
    description: "Sharp and focused: charcoal surfaces, moonlit-silver detail, signal-red actions.",
    brand: [
      { name: "Charcoal Grey", hex: "#2A2A2A" },
      { name: "Moonlit Silver", hex: "#C0C0C0" },
      { name: "Signal Red", hex: "#E10600" },
    ],
    preferredMode: "dark",
    modes: {
      light: {
        background: "#F3F3F3", backgroundElevated: "#FFFFFF",
        foreground: "#1C1C1C", foregroundMuted: "#555555", foregroundSubtle: "#7A7A7A",
        surface: "rgba(255, 255, 255, 0.86)", surfaceSolid: "#FFFFFF",
        surfaceHover: "rgba(42, 42, 42, 0.05)", surfaceActive: "rgba(42, 42, 42, 0.10)",
        border: "#DCDCDC", borderStrong: "rgba(42, 42, 42, 0.22)", borderGlow: "rgba(225, 6, 0, 0.28)",
        glass: "rgba(255, 255, 255, 0.84)", glassStrong: "rgba(255, 255, 255, 0.95)", overlay: "rgba(20, 20, 20, 0.45)",
        primary: "#2A2A2A", primaryForeground: "#FFFFFF", primaryMuted: "rgba(192, 192, 192, 0.38)",
        accent: "#B80500", accentMuted: "rgba(225, 6, 0, 0.09)", accentBorder: "rgba(225, 6, 0, 0.30)",
        cta: "#E10600", ctaForeground: "#FFFFFF",
        ring: "#B80500", selection: "rgba(225, 6, 0, 0.18)", selectionForeground: "#1C1C1C",
        aurora: ["rgba(192, 192, 192, 0.30)", "rgba(225, 6, 0, 0.05)", "rgba(42, 42, 42, 0.04)"],
        ...STATUS_LIGHT,
        chart: ["#2A2A2A", "#B80500", "#2F6FA8", "#9A6A00", "#2E7D4F"],
        chartTick: "#6E6E6E",
      },
      dark: {
        background: "#121212", backgroundElevated: "#1B1B1B",
        foreground: "#F2F2F2", foregroundMuted: "#B5B5B5", foregroundSubtle: "#8A8A8A",
        surface: "rgba(42, 42, 42, 0.72)", surfaceSolid: "#222222",
        surfaceHover: "rgba(192, 192, 192, 0.07)", surfaceActive: "rgba(192, 192, 192, 0.12)",
        border: "#333333", borderStrong: "rgba(192, 192, 192, 0.20)", borderGlow: "rgba(225, 6, 0, 0.35)",
        glass: "rgba(34, 34, 34, 0.78)", glassStrong: "rgba(34, 34, 34, 0.93)", overlay: "rgba(0, 0, 0, 0.65)",
        primary: "#C0C0C0", primaryForeground: "#121212", primaryMuted: "rgba(192, 192, 192, 0.13)",
        accent: "#FF5A4F", accentMuted: "rgba(225, 6, 0, 0.16)", accentBorder: "rgba(255, 90, 79, 0.40)",
        cta: "#E10600", ctaForeground: "#FFFFFF",
        ring: "#FF5A4F", selection: "rgba(225, 6, 0, 0.35)", selectionForeground: "#FFFFFF",
        aurora: ["rgba(192, 192, 192, 0.05)", "rgba(225, 6, 0, 0.08)", "rgba(42, 42, 42, 0.30)"],
        ...STATUS_DARK,
        chart: ["#C0C0C0", "#FF5A4F", "#6FA8DC", "#E6B450", "#8FD19E"],
        chartTick: "#8A8A8A",
      },
    },
  },
  {
    id: "amethyst-voltage",
    name: "Amethyst Voltage",
    description: "Electric nights: jet-black depth, royal-amethyst panels, cyan sparks for actions.",
    brand: [
      { name: "Jet Black", hex: "#050505" },
      { name: "Royal Amethyst", hex: "#3B0A6B" },
      { name: "Electric Cyan", hex: "#00E5FF" },
    ],
    preferredMode: "dark",
    modes: {
      light: {
        background: "#F7F5FB", backgroundElevated: "#FFFFFF",
        foreground: "#1A1024", foregroundMuted: "#5B4E6E", foregroundSubtle: "#857A99",
        surface: "rgba(255, 255, 255, 0.86)", surfaceSolid: "#FFFFFF",
        surfaceHover: "rgba(59, 10, 107, 0.05)", surfaceActive: "rgba(59, 10, 107, 0.10)",
        border: "#E4DDF0", borderStrong: "rgba(59, 10, 107, 0.22)", borderGlow: "rgba(0, 229, 255, 0.40)",
        glass: "rgba(255, 255, 255, 0.84)", glassStrong: "rgba(255, 255, 255, 0.95)", overlay: "rgba(26, 16, 36, 0.45)",
        primary: "#3B0A6B", primaryForeground: "#FFFFFF", primaryMuted: "rgba(59, 10, 107, 0.10)",
        accent: "#00708A", accentMuted: "rgba(0, 229, 255, 0.14)", accentBorder: "rgba(0, 120, 140, 0.32)",
        cta: "#00788C", ctaForeground: "#FFFFFF",
        ring: "#3B0A6B", selection: "rgba(0, 229, 255, 0.28)", selectionForeground: "#1A1024",
        aurora: ["rgba(59, 10, 107, 0.08)", "rgba(0, 229, 255, 0.10)", "rgba(255, 255, 255, 0.30)"],
        ...STATUS_LIGHT,
        chart: ["#3B0A6B", "#00788C", "#C2185B", "#9A6A00", "#2E7D4F"],
        chartTick: "#6E6577",
      },
      dark: {
        background: "#050505", backgroundElevated: "#0E0A14",
        foreground: "#F3F0FA", foregroundMuted: "#B9AFCB", foregroundSubtle: "#857A99",
        surface: "rgba(26, 12, 44, 0.72)", surfaceSolid: "#130D1C",
        surfaceHover: "rgba(0, 229, 255, 0.06)", surfaceActive: "rgba(59, 10, 107, 0.55)",
        border: "#2A1F3A", borderStrong: "rgba(201, 168, 245, 0.22)", borderGlow: "rgba(0, 229, 255, 0.35)",
        glass: "rgba(19, 13, 28, 0.80)", glassStrong: "rgba(19, 13, 28, 0.94)", overlay: "rgba(0, 0, 0, 0.70)",
        primary: "#C9A8F5", primaryForeground: "#1A0533", primaryMuted: "rgba(59, 10, 107, 0.50)",
        accent: "#00E5FF", accentMuted: "rgba(0, 229, 255, 0.12)", accentBorder: "rgba(0, 229, 255, 0.38)",
        cta: "#00E5FF", ctaForeground: "#050505",
        ring: "#00E5FF", selection: "rgba(0, 229, 255, 0.30)", selectionForeground: "#FFFFFF",
        aurora: ["rgba(59, 10, 107, 0.30)", "rgba(0, 229, 255, 0.07)", "rgba(59, 10, 107, 0.15)"],
        ...STATUS_DARK,
        chart: ["#00E5FF", "#B57BFF", "#FF6FB5", "#FFD166", "#7CF29C"],
        chartTick: "#857A99",
      },
    },
  },
  {
    id: "sage-hearth",
    name: "Sage Hearth",
    description: "Calm and grounded: sage greens, walnut structure, a warm amber glow for actions.",
    brand: [
      { name: "Sage Green", hex: "#87A96B" },
      { name: "Walnut Brown", hex: "#5A3E2B" },
      { name: "Amber Glow", hex: "#D5851F" },
    ],
    preferredMode: "light",
    modes: {
      light: {
        background: "#F3F1E9", backgroundElevated: "#FFFEFA",
        foreground: "#2B2118", foregroundMuted: "#5E5245", foregroundSubtle: "#857A6A",
        surface: "rgba(255, 254, 250, 0.86)", surfaceSolid: "#FFFEFA",
        surfaceHover: "rgba(135, 169, 107, 0.10)", surfaceActive: "rgba(135, 169, 107, 0.18)",
        border: "#E1DBCC", borderStrong: "rgba(90, 62, 43, 0.22)", borderGlow: "rgba(213, 133, 31, 0.32)",
        glass: "rgba(255, 254, 250, 0.84)", glassStrong: "rgba(255, 254, 250, 0.95)", overlay: "rgba(43, 33, 24, 0.42)",
        primary: "#5A3E2B", primaryForeground: "#FFF8EF", primaryMuted: "rgba(135, 169, 107, 0.28)",
        accent: "#4E6B37", accentMuted: "rgba(135, 169, 107, 0.18)", accentBorder: "rgba(78, 107, 55, 0.32)",
        cta: "#D5851F", ctaForeground: "#2B1A08",
        ring: "#4E6B37", selection: "rgba(213, 133, 31, 0.26)", selectionForeground: "#2B2118",
        aurora: ["rgba(135, 169, 107, 0.22)", "rgba(213, 133, 31, 0.08)", "rgba(90, 62, 43, 0.05)"],
        ...STATUS_LIGHT,
        chart: ["#5A3E2B", "#4E6B37", "#B06A12", "#2F6688", "#8E4A6B"],
        chartTick: "#7A6E5E",
      },
      dark: {
        background: "#14120E", backgroundElevated: "#1D1A15",
        foreground: "#F2EDE3", foregroundMuted: "#C2B8A6", foregroundSubtle: "#8F8574",
        surface: "rgba(34, 30, 24, 0.78)", surfaceSolid: "#221E18",
        surfaceHover: "rgba(135, 169, 107, 0.08)", surfaceActive: "rgba(135, 169, 107, 0.14)",
        border: "#353026", borderStrong: "rgba(169, 199, 143, 0.20)", borderGlow: "rgba(213, 133, 31, 0.30)",
        glass: "rgba(34, 30, 24, 0.80)", glassStrong: "rgba(34, 30, 24, 0.93)", overlay: "rgba(0, 0, 0, 0.62)",
        primary: "#A9C78F", primaryForeground: "#1A2410", primaryMuted: "rgba(135, 169, 107, 0.18)",
        accent: "#E8A04A", accentMuted: "rgba(213, 133, 31, 0.16)", accentBorder: "rgba(232, 160, 74, 0.38)",
        cta: "#D5851F", ctaForeground: "#14120E",
        ring: "#A9C78F", selection: "rgba(213, 133, 31, 0.34)", selectionForeground: "#FFFFFF",
        aurora: ["rgba(135, 169, 107, 0.08)", "rgba(213, 133, 31, 0.08)", "rgba(90, 62, 43, 0.20)"],
        ...STATUS_DARK,
        chart: ["#A9C78F", "#E8A04A", "#C49A7A", "#7FB3D5", "#D59AC0"],
        chartTick: "#8F8574",
      },
    },
  },
  {
    id: "pine-lilac",
    name: "Pine & Lilac",
    description: "Soft and natural: oatmeal pages, deep pine structure, gentle lilac highlights.",
    brand: [
      { name: "Oatmeal", hex: "#E8DCC6" },
      { name: "Pine Green", hex: "#1F3B2E" },
      { name: "Soft Lilac", hex: "#CBB3E8" },
    ],
    preferredMode: "light",
    modes: {
      light: {
        background: "#EFE6D6", backgroundElevated: "#FBF7F0",
        foreground: "#1C2A22", foregroundMuted: "#4F5A50", foregroundSubtle: "#76786C",
        surface: "rgba(251, 247, 240, 0.86)", surfaceSolid: "#FBF7F0",
        surfaceHover: "rgba(31, 59, 46, 0.05)", surfaceActive: "rgba(31, 59, 46, 0.10)",
        border: "#DDD2BF", borderStrong: "rgba(31, 59, 46, 0.22)", borderGlow: "rgba(203, 179, 232, 0.55)",
        glass: "rgba(251, 247, 240, 0.84)", glassStrong: "rgba(251, 247, 240, 0.95)", overlay: "rgba(28, 42, 34, 0.42)",
        primary: "#1F3B2E", primaryForeground: "#F6F1E7", primaryMuted: "rgba(203, 179, 232, 0.45)",
        accent: "#6B4A94", accentMuted: "rgba(203, 179, 232, 0.30)", accentBorder: "rgba(107, 74, 148, 0.30)",
        cta: "#CBB3E8", ctaForeground: "#1F3B2E",
        ring: "#6B4A94", selection: "rgba(203, 179, 232, 0.55)", selectionForeground: "#1C2A22",
        aurora: ["rgba(203, 179, 232, 0.28)", "rgba(31, 59, 46, 0.06)", "rgba(255, 255, 255, 0.30)"],
        ...STATUS_LIGHT,
        chart: ["#1F3B2E", "#6B4A94", "#A8642A", "#2F6688", "#B4436C"],
        chartTick: "#6F7468",
      },
      dark: {
        background: "#0F1813", backgroundElevated: "#16221B",
        foreground: "#EFE8DA", foregroundMuted: "#BDB4A3", foregroundSubtle: "#8A8475",
        surface: "rgba(26, 40, 32, 0.78)", surfaceSolid: "#1A2820",
        surfaceHover: "rgba(203, 179, 232, 0.07)", surfaceActive: "rgba(203, 179, 232, 0.12)",
        border: "#2A3A31", borderStrong: "rgba(232, 220, 198, 0.18)", borderGlow: "rgba(203, 179, 232, 0.30)",
        glass: "rgba(26, 40, 32, 0.80)", glassStrong: "rgba(26, 40, 32, 0.93)", overlay: "rgba(0, 0, 0, 0.62)",
        primary: "#CBB3E8", primaryForeground: "#1F1530", primaryMuted: "rgba(203, 179, 232, 0.16)",
        accent: "#9CC9AE", accentMuted: "rgba(156, 201, 174, 0.14)", accentBorder: "rgba(156, 201, 174, 0.36)",
        cta: "#CBB3E8", ctaForeground: "#1F3B2E",
        ring: "#CBB3E8", selection: "rgba(203, 179, 232, 0.32)", selectionForeground: "#FFFFFF",
        aurora: ["rgba(203, 179, 232, 0.07)", "rgba(31, 59, 46, 0.35)", "rgba(232, 220, 198, 0.03)"],
        ...STATUS_DARK,
        chart: ["#CBB3E8", "#9CC9AE", "#E8B86B", "#7FB3D5", "#F0968A"],
        chartTick: "#8A8475",
      },
    },
  },
  {
    id: "primary-pop",
    name: "Primary Pop",
    description: "Bright and playful: baby-blue skies, bold red actions, sunshine-yellow highlights.",
    brand: [
      { name: "Baby Blue", hex: "#B7D8F5" },
      { name: "Red", hex: "#E10600" },
      { name: "Sunshine Yellow", hex: "#FFD700" },
    ],
    preferredMode: "light",
    modes: {
      light: {
        background: "#EEF5FC", backgroundElevated: "#FFFFFF",
        foreground: "#0F1B2D", foregroundMuted: "#46566B", foregroundSubtle: "#6E7D90",
        surface: "rgba(255, 255, 255, 0.86)", surfaceSolid: "#FFFFFF",
        surfaceHover: "rgba(183, 216, 245, 0.35)", surfaceActive: "rgba(183, 216, 245, 0.60)",
        border: "#D3E3F3", borderStrong: "rgba(15, 27, 45, 0.20)", borderGlow: "rgba(255, 215, 0, 0.55)",
        glass: "rgba(255, 255, 255, 0.84)", glassStrong: "rgba(255, 255, 255, 0.95)", overlay: "rgba(15, 27, 45, 0.42)",
        primary: "#C00500", primaryForeground: "#FFFFFF", primaryMuted: "rgba(183, 216, 245, 0.60)",
        accent: "#1F5F99", accentMuted: "rgba(183, 216, 245, 0.45)", accentBorder: "rgba(31, 95, 153, 0.30)",
        cta: "#E10600", ctaForeground: "#FFFFFF",
        ring: "#1F5F99", selection: "rgba(255, 215, 0, 0.45)", selectionForeground: "#0F1B2D",
        aurora: ["rgba(183, 216, 245, 0.45)", "rgba(255, 215, 0, 0.12)", "rgba(225, 6, 0, 0.04)"],
        ...STATUS_LIGHT,
        chart: ["#1F5F99", "#C00500", "#8F7300", "#2E7D4F", "#7B5BA8"],
        chartTick: "#5F6E80",
      },
      dark: {
        background: "#0B1420", backgroundElevated: "#111D2C",
        foreground: "#EEF5FC", foregroundMuted: "#A9BDD3", foregroundSubtle: "#7A8EA6",
        surface: "rgba(20, 34, 51, 0.78)", surfaceSolid: "#142233",
        surfaceHover: "rgba(183, 216, 245, 0.07)", surfaceActive: "rgba(183, 216, 245, 0.12)",
        border: "#22344A", borderStrong: "rgba(183, 216, 245, 0.20)", borderGlow: "rgba(255, 215, 0, 0.30)",
        glass: "rgba(20, 34, 51, 0.80)", glassStrong: "rgba(20, 34, 51, 0.93)", overlay: "rgba(0, 0, 0, 0.62)",
        primary: "#B7D8F5", primaryForeground: "#0B1420", primaryMuted: "rgba(183, 216, 245, 0.14)",
        accent: "#FFD700", accentMuted: "rgba(255, 215, 0, 0.12)", accentBorder: "rgba(255, 215, 0, 0.38)",
        cta: "#E10600", ctaForeground: "#FFFFFF",
        ring: "#FFD700", selection: "rgba(255, 215, 0, 0.30)", selectionForeground: "#FFFFFF",
        aurora: ["rgba(183, 216, 245, 0.07)", "rgba(255, 215, 0, 0.05)", "rgba(225, 6, 0, 0.05)"],
        ...STATUS_DARK,
        chart: ["#B7D8F5", "#FF5A4F", "#FFD700", "#7CE0A3", "#C9A8F5"],
        chartTick: "#7A8EA6",
      },
    },
  },
];

export function isPalettePreference(value: unknown): value is PalettePreference {
  return value === "default" || (typeof value === "string" && (PALETTE_IDS as readonly string[]).includes(value));
}

export function getPalette(id: PalettePreference): PaletteDefinition | null {
  return PALETTES.find((p) => p.id === id) ?? null;
}

/** Semantic CSS variables for one palette/mode. */
export function paletteCssVars(tokens: PaletteTokens): Record<string, string> {
  return {
    "--background": tokens.background,
    "--background-elevated": tokens.backgroundElevated,
    "--foreground": tokens.foreground,
    "--foreground-muted": tokens.foregroundMuted,
    "--foreground-subtle": tokens.foregroundSubtle,
    "--surface": tokens.surface,
    "--surface-solid": tokens.surfaceSolid,
    "--surface-hover": tokens.surfaceHover,
    "--surface-active": tokens.surfaceActive,
    "--border": tokens.border,
    "--border-strong": tokens.borderStrong,
    "--border-glow": tokens.borderGlow,
    "--glass": tokens.glass,
    "--glass-border": tokens.border,
    "--glass-strong": tokens.glassStrong,
    "--overlay": tokens.overlay,
    "--primary": tokens.primary,
    "--primary-foreground": tokens.primaryForeground,
    "--primary-muted": tokens.primaryMuted,
    "--accent": tokens.accent,
    "--accent-muted": tokens.accentMuted,
    "--accent-border": tokens.accentBorder,
    "--cue-accent": tokens.accent,
    "--cue-info": tokens.accent,
    "--cue-purple": tokens.chart[3],
    "--cta": tokens.cta,
    "--cta-foreground": tokens.ctaForeground,
    "--ring": tokens.ring,
    "--selection": tokens.selection,
    "--selection-foreground": tokens.selectionForeground,
    "--aurora-1": tokens.aurora[0],
    "--aurora-2": tokens.aurora[1],
    "--aurora-3": tokens.aurora[2],
    "--success-fg": tokens.successFg,
    "--warning-fg": tokens.warningFg,
    "--danger-fg": tokens.dangerFg,
    "--chart-1": tokens.chart[0],
    "--chart-2": tokens.chart[1],
    "--chart-3": tokens.chart[2],
    "--chart-4": tokens.chart[3],
    "--chart-5": tokens.chart[4],
    "--chart-line": tokens.chart[0],
    "--chart-area": tokens.chart[1],
    "--chart-tick": tokens.chartTick,
    "--gauge-from": tokens.chart[0],
    "--gauge-to": tokens.chart[1],
  };
}

const block = (selector: string, vars: Record<string, string>, colorScheme: ColorMode) =>
  `${selector}{color-scheme:${colorScheme};${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;

/**
 * Stylesheet for every palette, generated from this config so tokens have one source of truth.
 * `html[data-palette]` outranks the base `:root` / `[data-theme="light"]` rules; the light variant
 * adds `[data-theme="light"]` so the mode toggle keeps working inside each palette.
 */
export function paletteStylesheet(): string {
  const rules: string[] = [];
  for (const p of PALETTES) {
    rules.push(block(`html[data-palette="${p.id}"]`, paletteCssVars(p.modes.dark), "dark"));
    rules.push(block(`html[data-palette="${p.id}"][data-theme="light"]`, paletteCssVars(p.modes.light), "light"));
  }
  rules.push("html[data-palette] .btn-gradient{background:var(--cta);color:var(--cta-foreground)}");
  return rules.join("\n");
}

// ------------------------------------------------------------------ contrast (WCAG 2.x)

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Expected #rrggbb, got ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
