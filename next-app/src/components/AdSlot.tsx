type AdSlotVariant = "default" | "compact" | "wide";

type AdSlotProps = {
  position: string;
  variant?: AdSlotVariant;
  className?: string;
};

const variantClassMap: Record<AdSlotVariant, string> = {
  default: "ad-slot--default",
  compact: "ad-slot--compact",
  wide: "ad-slot--wide",
};

export function AdSlot({
  position,
  variant = "default",
  className,
}: AdSlotProps) {
  const classes = ["ad-slot", variantClassMap[variant], className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      data-ad-slot={position}
      aria-label={`広告枠: ${position}`}
      role="region"
    >
      <span className="ad-slot__label">広告枠（準備中）</span>
      <span className="ad-slot__position">{position}</span>
    </div>
  );
}

