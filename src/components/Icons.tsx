import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function BaseIcon({ size = 24, className, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const Icons = {
  Clock: (props: IconProps) => (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l4 2" />
    </BaseIcon>
  ),
  Wallet: (props: IconProps) => (
    <BaseIcon {...props}>
      <path d="M3 7h18v10H3z" />
      <path d="M16 12h5" />
      <circle cx="16" cy="12" r="1" />
    </BaseIcon>
  ),
  Calendar: (props: IconProps) => (
    <BaseIcon {...props}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18" />
    </BaseIcon>
  ),
};
