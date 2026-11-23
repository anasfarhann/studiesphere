import Link from "next/link";
import { t } from "@/i18n/en";
import { BrandPanel } from "@/ui/BrandPanel";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-ground p-3 sm:p-5">
      <BrandPanel brandAsHeading className="mx-auto w-full max-w-[1240px] flex-1">
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-sm font-medium text-white"
          >
            {t("signIn")}
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-12 items-center justify-center rounded-full bg-card px-6 text-sm font-medium text-ink"
          >
            {t("createAccount")}
          </Link>
        </div>
      </BrandPanel>
    </main>
  );
}
