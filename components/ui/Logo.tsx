/**
 * AstraBill logo.
 *
 * `wordmark` — icon + "AstraBill" lockup. The asset is monochrome, so we
 * render the black and white versions and let CSS show the right one per
 * theme (`dark:` variant). No client component, no theme-flash.
 *
 * `brandmark` — the icon alone, in brand blue (works on either theme).
 *
 * Source assets are PNG; `next/image` serves an optimised, resized variant.
 */
import Image from "next/image";

import brandmark from "@/public/astrabill-brandmark.png";
import logoBlack from "@/public/astrabill-logo-black.png";
import logoWhite from "@/public/astrabill-logo-white.png";

export function Logo({
  variant = "wordmark",
  className = "",
  priority = false,
}: {
  variant?: "wordmark" | "brandmark";
  className?: string;
  priority?: boolean;
}) {
  if (variant === "brandmark") {
    return (
      <Image
        src={brandmark}
        alt="AstraBill"
        priority={priority}
        className={className}
      />
    );
  }

  return (
    <>
      <Image
        src={logoBlack}
        alt="AstraBill"
        priority={priority}
        className={`${className} block dark:hidden`}
      />
      <Image
        src={logoWhite}
        alt="AstraBill"
        priority={priority}
        aria-hidden
        className={`${className} hidden dark:block`}
      />
    </>
  );
}
