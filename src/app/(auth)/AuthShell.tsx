import type { ReactNode } from "react";
import { t } from "@/i18n/en";
import { BrandPanel, PhoneBrand } from "@/ui/BrandPanel";

/**
 * A+ layout shared by sign-in, sign-up, forgot and reset password.
 * Laptop (lg+): brand panel with previews | 480 px form card. iPad portrait (md): panel above the card.
 * Phone: wordmark + four tiles, then the card fills the rest; `alt` sits at the card's bottom.
 */
export function AuthShell({ children, alt }: { children: ReactNode; alt?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col gap-3.5 bg-ground p-4 md:gap-5 md:p-5 lg:flex-row">
      <BrandPanel className="hidden md:flex lg:flex-1" />
      <PhoneBrand className="flex md:hidden" />
      <section
        aria-labelledby="auth-heading"
        className="flex min-w-0 flex-1 flex-col rounded-[28px] bg-card px-[22px] pt-7 pb-[22px] md:rounded-[32px] md:px-12 md:py-10 lg:flex-none lg:basis-[380px] lg:max-xl:px-9 xl:basis-[480px]"
      >
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col md:justify-center lg:max-w-none">
          {children}
          {alt && <div className="mt-auto pt-6 md:mt-0 md:pt-[22px]">{alt}</div>}
        </div>
        <p className="m-0 hidden pt-6 text-center text-[12.5px] text-muted md:block">{t("authSyncFooter")}</p>
      </section>
    </main>
  );
}

export const formClass = "flex w-full flex-col gap-4 lg:gap-[18px]";
