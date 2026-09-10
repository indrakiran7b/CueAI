export function CueLogo({ size = 18, tone = "dark" }: { size?: number; tone?: "dark" | "light" }) {
  const fill = tone === "light" ? "#ffffff" : "#090909";
  const eyes = "#0099ff";

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 12.2c0-4 2.9-7.2 7.5-7.2s7.5 3.2 7.5 7.2c0 2-.7 3.7-2 5l1.3 2.6c.2.4-.2.9-.6.9H12c-4.6 0-7.5-3.2-7.5-8.5z"
        fill={fill}
      />
      <circle cx="9.6" cy="11.6" r="1.15" fill={eyes} />
      <circle cx="14.4" cy="11.6" r="1.15" fill={eyes} />
    </svg>
  );
}
