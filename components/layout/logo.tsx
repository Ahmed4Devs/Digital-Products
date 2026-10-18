type LogoProps = {
  className?: string;
};

/** Placeholder brand mark. Uses currentColor so it follows the theme in both modes. */
export function Logo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x="4" y="4" width="24" height="24" rx="7" />
      <path d="M16 10v10m0 0-4.5-4.5M16 20l4.5-4.5M11 23h10" />
    </svg>
  );
}
