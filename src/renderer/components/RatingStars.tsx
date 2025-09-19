import { useState } from "react";

interface RatingStarsProps {
  rating: number;
  onChange: (nextRating: number) => void;
  max?: number;
  size?: "compact" | "regular";
}

const starPath =
  "M12 2.5l2.882 6.221 6.855.586-5.194 4.48 1.584 6.706L12 16.96l-6.127 3.533 1.584-6.706-5.194-4.48 6.855-.586z";

function StarIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path
        d={starPath}
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function RatingStars({
  rating,
  onChange,
  max = 5,
  size = "regular",
}: RatingStarsProps) {
  const [hover, setHover] = useState<number | null>(null);
  const starSize = size === "compact" ? 18 : 24;
  const containerClass = size === "compact" ? "flex gap-1.5" : "flex gap-2";
  const activeRating = hover ?? rating;

  return (
    <div className={containerClass}>
      {Array.from({ length: max }, (_, index) => {
        const value = index + 1;
        const filled = value <= activeRating;

        return (
          <button
            key={value}
            type="button"
            onMouseEnter={() => setHover(value)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(value)}
            onBlur={() => setHover(null)}
            onClick={() => {
              onChange(value === rating ? 0 : value);
            }}
            title={`${value} / ${max}`}
            className="inline-flex items-center justify-center rounded-full p-0 transition-transform duration-150 ease-out focus:outline-none"
            style={{
              color: filled ? "#ffce52" : "#6b7380",
              transform: hover === value ? "scale(1.1)" : "scale(1)",
            }}
          >
            <StarIcon filled={filled} size={starSize} />
          </button>
        );
      })}
    </div>
  );
}
