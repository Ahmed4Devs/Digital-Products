"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { SubmitButton } from "@/components/auth/submit-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateLegalPageAction } from "@/features/settings/actions";
import type { LegalPage } from "@/features/settings/schemas";
import { useRouter } from "@/i18n/navigation";
import { ActionFeedback } from "./action-feedback";
import { LazyRichTextEditor } from "./lazy-rich-text-editor";
import { useActionForm } from "./use-action-form";
import { useActionMessages } from "./use-action-messages";

type LegalTexts = Record<LegalPage, { ar: string; en: string }>;

const LANGUAGES = [
  { code: "ar", dir: "rtl", field: "contentAr" },
  { code: "en", dir: "ltr", field: "contentEn" },
] as const;

function LegalPageForm({ page, texts }: { page: LegalPage; texts: { ar: string; en: string } }) {
  const t = useTranslations("admin.legal");
  const messages = useActionMessages();
  const router = useRouter();
  const id = useId();
  const { state, pending, onSubmit } = useActionForm(updateLegalPageAction, () => router.refresh());

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="page" value={page} />
      {LANGUAGES.map((language) => {
        const labelId = `${id}-${language.code}`;
        const error = state.fieldErrors?.[language.field];
        return (
          <div key={language.code} className="flex flex-col gap-2">
            <span id={labelId} className="text-sm font-medium">
              {t(language.code === "ar" ? "arabic" : "english", { page: t(`pages.${page}`) })}
            </span>
            <LazyRichTextEditor
              name={language.field}
              defaultValue={texts[language.code]}
              labelId={labelId}
              dir={language.dir}
              lang={language.code}
            />
            {error ? (
              <p className="text-xs font-medium text-destructive">{messages.error(error)}</p>
            ) : null}
          </div>
        );
      })}
      <ActionFeedback state={state.fieldErrors ? { status: "idle" } : state} />
      <div className="sm:w-40">
        <SubmitButton pending={pending}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}

/** One tab per legal page; each page is saved on its own, in both languages. */
export function LegalContentForm({ texts }: { texts: LegalTexts }) {
  const t = useTranslations("admin.legal");
  const pages = Object.keys(texts) as LegalPage[];
  return (
    <Tabs defaultValue={pages[0]}>
      <TabsList aria-label={t("pagesLabel")} className="flex-wrap">
        {pages.map((page) => (
          <TabsTrigger key={page} value={page}>
            {t(`pages.${page}`)}
          </TabsTrigger>
        ))}
      </TabsList>
      {pages.map((page) => (
        // Kept mounted so unsaved edits survive switching tabs.
        <TabsContent key={page} value={page} keepMounted className="pt-4">
          <LegalPageForm page={page} texts={texts[page]} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
