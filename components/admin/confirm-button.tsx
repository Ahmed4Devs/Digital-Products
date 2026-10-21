"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type ConfirmButtonProps = {
  /** Visible trigger content and its accessible name. */
  children: ReactNode;
  label?: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  variant?: "destructive" | "outline";
  size?: "default" | "sm" | "icon-sm";
};

/** A button that asks for confirmation before an irreversible owner action. */
export function ConfirmButton({
  children,
  label,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  disabled,
  variant = "destructive",
  size = "default",
}: ConfirmButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size={size}
            disabled={disabled}
            aria-label={label}
            title={label}
          />
        }
      >
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button type="button" variant="outline" />}>
            {cancelLabel}
          </AlertDialogClose>
          <AlertDialogClose
            render={<Button type="button" variant="destructive" onClick={onConfirm} />}
          >
            {confirmLabel}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
