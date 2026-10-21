"use client";

import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import {
  createCategoryAction,
  deleteCategoryAction,
  moveCategoryAction,
  updateCategoryAction,
} from "@/features/categories/actions";
import { useRouter } from "@/i18n/navigation";
import { IDLE, type ActionState } from "@/lib/actions";
import { localized } from "@/lib/text";
import { ActionFeedback } from "./action-feedback";
import { ConfirmButton } from "./confirm-button";
import { TextField } from "./form-field";
import { useActionForm } from "./use-action-form";

export type AdminCategory = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  productCount: number;
};

function CategoryForm({
  category,
  onSuccess,
  onCancel,
}: {
  category?: AdminCategory;
  onSuccess: (state: ActionState) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("admin.categories");
  const router = useRouter();
  const action = category ? updateCategoryAction.bind(null, category.id) : createCategoryAction;
  const { state, pending, onSubmit } = useActionForm(action, (result) => {
    router.refresh();
    onSuccess(result);
  });
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          name="nameAr"
          label={t("nameAr")}
          dir="rtl"
          lang="ar"
          defaultValue={category?.nameAr ?? ""}
          error={errors.nameAr}
          required
        />
        <TextField
          name="nameEn"
          label={t("nameEn")}
          dir="ltr"
          lang="en"
          defaultValue={category?.nameEn ?? ""}
          error={errors.nameEn}
        />
        <TextField
          name="slug"
          label={t("slug")}
          hint={t("slugHint")}
          dir="auto"
          defaultValue={category?.slug ?? ""}
          error={errors.slug}
          autoComplete="off"
        />
      </div>
      {/* Successes are announced by the manager: this form is reset after them. */}
      {state.status === "error" ? <ActionFeedback state={state} /> : null}
      <div className="flex gap-2">
        <div className="sm:w-40">
          <SubmitButton pending={pending}>{category ? t("save") : t("create")}</SubmitButton>
        </div>
        {onCancel ? (
          <Button type="button" variant="outline" size="lg" onClick={onCancel}>
            {t("cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Create, rename, reorder and delete categories (spec §11). */
export function CategoryManager({ categories }: { categories: AdminCategory[] }) {
  const t = useTranslations("admin.categories");
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [state, setState] = useState<ActionState>(IDLE);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionState>) {
    startTransition(async () => {
      setState(await action());
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="add-category"
        className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6"
      >
        <h2 id="add-category" className="flex items-center gap-2 text-lg font-semibold">
          <PlusIcon aria-hidden="true" className="size-5" />
          {t("add")}
        </h2>
        <CategoryForm key={categories.length} onSuccess={setState} />
      </section>

      <section aria-labelledby="category-list" className="flex flex-col gap-4">
        <h2 id="category-list" className="text-lg font-semibold">
          {t("list")}
        </h2>
        <ActionFeedback state={state} />
        {categories.length === 0 ? (
          <p className="text-muted-foreground">{t("empty")}</p>
        ) : (
          <ol className="flex flex-col divide-y rounded-xl border">
            {categories.map((category, index) => {
              const name = localized(locale, { ar: category.nameAr, en: category.nameEn });
              return (
                <li key={category.id} className="flex flex-col gap-4 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{name}</p>
                      <p className="text-sm text-muted-foreground">
                        <bdi dir="ltr">/{category.slug}</bdi> ·{" "}
                        {t("products", { count: category.productCount })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("moveUp", { name })}
                        title={t("moveUp", { name })}
                        disabled={pending || index === 0}
                        onClick={() => run(() => moveCategoryAction(category.id, "up"))}
                      >
                        <ArrowUpIcon aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("moveDown", { name })}
                        title={t("moveDown", { name })}
                        disabled={pending || index === categories.length - 1}
                        onClick={() => run(() => moveCategoryAction(category.id, "down"))}
                      >
                        <ArrowDownIcon aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("edit", { name })}
                        title={t("edit", { name })}
                        aria-expanded={editing === category.id}
                        onClick={() => setEditing(editing === category.id ? null : category.id)}
                      >
                        <PencilIcon aria-hidden="true" />
                      </Button>
                      <ConfirmButton
                        size="icon-sm"
                        label={t("delete", { name })}
                        title={t("deleteTitle")}
                        description={t("deleteDescription")}
                        confirmLabel={t("confirmDelete")}
                        cancelLabel={t("cancel")}
                        disabled={pending || category.productCount > 0}
                        onConfirm={() => run(() => deleteCategoryAction(category.id))}
                      >
                        <Trash2Icon aria-hidden="true" />
                      </ConfirmButton>
                    </div>
                  </div>
                  {editing === category.id ? (
                    <CategoryForm
                      category={category}
                      onSuccess={(result) => {
                        setState(result);
                        setEditing(null);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
