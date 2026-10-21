"use client";

import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { SubmitButton } from "@/components/auth/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createProductAction, updateProductAction } from "@/features/products/actions";
import { PRODUCT_LIMITS } from "@/features/products/schemas";
import { useRouter } from "@/i18n/navigation";
import { ActionFeedback } from "./action-feedback";
import { describedBy, FieldShell, TextField } from "./form-field";
import { LazyRichTextEditor } from "./lazy-rich-text-editor";
import { useActionForm } from "./use-action-form";
import { useActionMessages } from "./use-action-messages";

export type ProductFormDefaults = {
  slug: string;
  titleAr: string;
  titleEn: string;
  shortDescriptionAr: string;
  shortDescriptionEn: string;
  descriptionAr: string;
  descriptionEn: string;
  seoTitleAr: string;
  seoTitleEn: string;
  seoDescriptionAr: string;
  seoDescriptionEn: string;
  /** Major units as typed, e.g. "12.50". */
  priceUsd: string;
  fixedPriceSar: string;
  compareAtPriceUsd: string;
  categoryId: string;
  featured: boolean;
};

export type CategoryOption = { id: string; name: string };

type ProductFormProps = {
  productId?: string;
  defaults: ProductFormDefaults;
  categories: CategoryOption[];
};

const LANGUAGES = [
  { code: "ar", suffix: "Ar", dir: "rtl" },
  { code: "en", suffix: "En", dir: "ltr" },
] as const;

type Language = (typeof LANGUAGES)[number];

const LANGUAGE_FIELDS = [
  "title",
  "shortDescription",
  "description",
  "seoTitle",
  "seoDescription",
] as const;

function LanguageFields({
  language,
  defaults,
  errors,
}: {
  language: Language;
  defaults: ProductFormDefaults;
  errors: Record<string, string>;
}) {
  const t = useTranslations("admin.productForm");
  const messages = useActionMessages();
  const descriptionLabel = useId();
  const field = (name: (typeof LANGUAGE_FIELDS)[number]) => `${name}${language.suffix}` as const;
  const common = { dir: language.dir, lang: language.code };

  return (
    <div className="flex flex-col gap-5">
      <TextField
        {...common}
        name={field("title")}
        label={t("title")}
        defaultValue={defaults[field("title")]}
        error={errors[field("title")]}
        maxGraphemes={PRODUCT_LIMITS.title}
        emoji
      />
      <TextField
        {...common}
        name={field("shortDescription")}
        label={t("shortDescription")}
        defaultValue={defaults[field("shortDescription")]}
        error={errors[field("shortDescription")]}
        maxGraphemes={PRODUCT_LIMITS.shortDescription}
        multiline
        emoji
      />
      <div className="flex flex-col gap-2">
        <span id={descriptionLabel} className="text-sm font-medium">
          {t("description")}
        </span>
        <LazyRichTextEditor
          name={field("description")}
          defaultValue={defaults[field("description")]}
          labelId={descriptionLabel}
          {...common}
        />
        {errors[field("description")] ? (
          <p className="text-xs font-medium text-destructive">
            {messages.error(errors[field("description")])}
          </p>
        ) : null}
      </div>
      <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">{t("seo")}</legend>
        <p className="text-xs text-muted-foreground">{t("seoHint")}</p>
        <TextField
          {...common}
          name={field("seoTitle")}
          label={t("seoTitle")}
          defaultValue={defaults[field("seoTitle")]}
          error={errors[field("seoTitle")]}
          maxGraphemes={PRODUCT_LIMITS.seoTitle}
        />
        <TextField
          {...common}
          name={field("seoDescription")}
          label={t("seoDescription")}
          defaultValue={defaults[field("seoDescription")]}
          error={errors[field("seoDescription")]}
          maxGraphemes={PRODUCT_LIMITS.seoDescription}
          multiline
        />
      </fieldset>
    </div>
  );
}

/** Create or edit a product's details, prices and organization (spec §11). */
export function ProductForm({ productId, defaults, categories }: ProductFormProps) {
  const t = useTranslations("admin.productForm");
  const router = useRouter();
  const action = productId ? updateProductAction.bind(null, productId) : createProductAction;
  const { state, pending, onSubmit } = useActionForm(action, (result) => {
    // A new product continues on its edit page, where images and files are added.
    if (!productId && result.id) router.push(`/admin/products/${result.id}?created=1`);
    else router.refresh();
  });
  const errors = state.fieldErrors ?? {};
  const categoryId = useId();
  const featuredId = useId();

  const languageHasErrors = (language: Language) =>
    LANGUAGE_FIELDS.some((name) => errors[`${name}${language.suffix}`] !== undefined);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <section
        aria-labelledby="details-heading"
        className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
      >
        <div>
          <h2 id="details-heading" className="text-lg font-semibold">
            {t("details")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("fallbackHint")}</p>
        </div>
        <Tabs defaultValue="ar">
          <TabsList aria-label={t("languages")}>
            {LANGUAGES.map((language) => (
              <TabsTrigger key={language.code} value={language.code}>
                <span lang={language.code}>{t(language.code === "ar" ? "arabic" : "english")}</span>
                {languageHasErrors(language) ? (
                  <CircleAlertIcon aria-label={t("tabHasErrors")} className="text-destructive" />
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          {LANGUAGES.map((language) => (
            // Kept mounted so both languages are always submitted.
            <TabsContent key={language.code} value={language.code} keepMounted className="pt-2">
              <LanguageFields language={language} defaults={defaults} errors={errors} />
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <section
        aria-labelledby="pricing-heading"
        className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
      >
        <h2 id="pricing-heading" className="text-lg font-semibold">
          {t("pricing")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="priceUsd"
            label={t("priceUsd")}
            hint={t("priceHint")}
            defaultValue={defaults.priceUsd}
            error={errors.priceUsd}
            inputMode="decimal"
            dir="ltr"
            required
          />
          <TextField
            name="fixedPriceSar"
            label={t("fixedPriceSar")}
            hint={t("fixedPriceSarHint")}
            defaultValue={defaults.fixedPriceSar}
            error={errors.fixedPriceSar}
            inputMode="decimal"
            dir="ltr"
          />
          <TextField
            name="compareAtPriceUsd"
            label={t("compareAtPriceUsd")}
            hint={t("compareAtPriceHint")}
            defaultValue={defaults.compareAtPriceUsd}
            error={errors.compareAtPriceUsd}
            inputMode="decimal"
            dir="ltr"
          />
        </div>
      </section>

      <section
        aria-labelledby="organization-heading"
        className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
      >
        <h2 id="organization-heading" className="text-lg font-semibold">
          {t("organization")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="slug"
            label={t("slug")}
            hint={t("slugHint")}
            defaultValue={defaults.slug}
            error={errors.slug}
            dir="auto"
            autoComplete="off"
          />
          <FieldShell id={categoryId} label={t("category")} error={errors.categoryId}>
            <NativeSelect
              id={categoryId}
              name="categoryId"
              defaultValue={defaults.categoryId}
              aria-invalid={errors.categoryId ? true : undefined}
              aria-describedby={describedBy(categoryId, undefined, errors.categoryId)}
            >
              <option value="">{t("noCategory")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </NativeSelect>
          </FieldShell>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id={featuredId} name="featured" defaultChecked={defaults.featured} />
          <Label htmlFor={featuredId}>{t("featured")}</Label>
        </div>
      </section>

      <ActionFeedback state={state} />
      <div className="sm:w-60">
        <SubmitButton pending={pending}>{productId ? t("save") : t("create")}</SubmitButton>
      </div>
    </form>
  );
}
