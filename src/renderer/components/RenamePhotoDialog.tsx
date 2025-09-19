import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/I18nProvider";

interface RenamePhotoDialogProps {
  name: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export default function RenamePhotoDialog({
  name,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
}: RenamePhotoDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.focus();
    element.select();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (!dialog.open) {
      dialog.showModal();
    }

    const handleCancel = (event: Event) => {
      event.preventDefault();
      dialog.close();
      onCancel();
    };

    dialog.addEventListener("cancel", handleCancel);

    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [onCancel]);

  return (
    <dialog
      ref={dialogRef}
      className="z-50 w-full max-w-md rounded-2xl border border-sky-300/40 bg-slate-900/95 p-5 shadow-[0_20px_44px_rgba(0,0,0,0.4)]"
      aria-label={t("renameDialog.ariaLabel")}
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        margin: 0,
        padding: 0,
      }}
    >
      <form
        className="w-full rounded-2xl border border-sky-300/40 bg-slate-900/95 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <h2 className="text-lg font-semibold text-slate-100">
          {t("renameDialog.title")}
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          {t("renameDialog.description")}
        </p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(event) => onChange(event.target.value)}
          className="mt-4 w-full rounded-xl border border-sky-400/30 bg-slate-950/70 px-4 py-2 text-sm text-slate-50 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/40"
          spellCheck={false}
          autoComplete="off"
        />
        <div className="mt-6 flex justify-end gap-3 text-sm">
          <button
            type="button"
            className="rounded-full border border-slate-500/40 px-4 py-1.5 text-slate-300 transition hover:bg-slate-700/40"
            onClick={() => {
              dialogRef.current?.close();
              onCancel();
            }}
            disabled={isSubmitting}
          >
            {t("renameDialog.cancel")}
          </button>
          <button
            type="submit"
            className="rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 px-5 py-1.5 font-semibold text-slate-900 shadow-[0_10px_24px_rgba(68,131,255,0.28)] transition hover:shadow-[0_12px_28px_rgba(68,131,255,0.36)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? t("renameDialog.saving") : t("renameDialog.save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
