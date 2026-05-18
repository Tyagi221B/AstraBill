/**
 * AstraBill logo.
 *
 * `wordmark` — icon + "AstraBill" lockup. The asset is monochrome, so we
 * render the black and white versions and let CSS show the right one per
 * theme (`dark:` variant). No client component, no theme-flash.
 *
 * `brandmark` — the icon alone, in brand blue (works on either theme).
 *
 * Assets are WebP, trimmed tight to the artwork (the original PNGs carried
 * heavy transparent padding, which made the logo render small). When proper
 * SVGs land, only these three imports change.
 */
import Image from "next/image";

import brandmark from "@/public/astrabill-brandmark.webp";
import logoBlack from "@/public/astrabill-logo-black.webp";
import logoWhite from "@/public/astrabill-logo-white.webp";

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
