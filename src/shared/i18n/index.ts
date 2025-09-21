export const supportedLocales = ["ja", "en"] as const;
export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "en";

const localeLabels: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
};

const intlLocaleMap: Record<Locale, string> = {
  ja: "ja-JP",
  en: "en-US",
};

const en = {
  "app.actions.clearFolder": "Close folder",
  "app.actions.loadFolder": "Load Folder",
  "app.actions.openFolder": "Open folder",
  "app.confirm.delete": "Move “{{name}}” to Trash?",
  "app.context.delete": "Delete",
  "app.context.rename": "Rename",
  "app.context.reveal": "Show in folder",
  "app.dialog.preview": "Photo preview",
  "app.directory.count": "{{count}} photos",
  "app.directory.countSingular": "{{count}} photo",
  "app.dnd.prompt": "Drop a folder to load photos.",
  "app.dnd.unsupported": "Only folders can be dropped here.",
  "app.dnd.emptyTitle": "Drag in a folder",
  "app.dnd.emptyDescription":
    "Drop a folder onto the grid to load its images instantly.",
  "app.empty.default": "Drag & drop a folder to browse its images.",
  "app.empty.rated":
    "No rated photos yet. Once you add ratings they will appear here.",
  "app.empty.unrated":
    "No unrated photos found. Clear ratings to see items here.",
  "app.error.alreadyDeleted": "The selected photo has already been removed.",
  "app.error.delete": "Failed to delete the photo.",
  "app.error.deleteUnexpected": "An unexpected error occurred while deleting.",
  "app.error.deleteWithReason": "Failed to delete the photo: {{reason}}",
  "app.error.fileNotFound": "File not found.",
  "app.error.rename": "Failed to rename the file.",
  "app.error.renameConflict": "A file with the same name already exists.",
  "app.error.renameEmpty": "Enter a file name.",
  "app.error.renameForbiddenCharacters":
    "Slashes cannot be used in file names.",
  "app.error.renameInvalid": "This name cannot be used.",
  "app.error.renameWithReason": "Failed to rename the file: {{reason}}",
  "app.error.reveal": "Could not reveal the photo location.",
  "app.error.revealNotFound": "File not found.",
  "app.error.revealWithReason":
    "Could not reveal the photo location: {{reason}}",
  "app.error.unknown": "An unknown error occurred.",
  "app.filter.all": "All ({{count}})",
  "app.filter.label": "Filter",
  "app.filter.rated": "Rated ({{count}})",
  "app.filter.ratedDisabled": "No rated photos yet.",
  "app.filter.stars.label": "Filter by rating",
  "app.filter.stars.none": "No rating",
  "app.filter.unrated": "Unrated ({{count}})",
  "app.filter.unratedDisabled": "No unrated photos.",
  "app.language.ariaLabel": "Select language",
  "app.language.label": "Language",
  "app.preview.resizeHandle": "Resize preview panel",
  "app.shortcuts.actions": "Actions",
  "app.shortcuts.actionsClose": "Close shortcuts panel",
  "app.shortcuts.actionsDelete": "Delete the selected photo",
  "app.shortcuts.actionsFilter": "Toggle filter (all / rated / unrated)",
  "app.shortcuts.actionsLoadFolder": "Load folder",
  "app.shortcuts.ariaLabel": "Keyboard shortcuts",
  "app.shortcuts.button": "Shortcuts",
  "app.shortcuts.close": "Close",
  "app.shortcuts.display": "Display",
  "app.shortcuts.displayToggleSort": "Cycle sort order",
  "app.shortcuts.navigation": "Navigation",
  "app.shortcuts.navigationJump":
    "Jump to first / last photo in the current list",
  "app.shortcuts.navigationMove": "Move to previous / next photo",
  "app.shortcuts.navigationToggle": "Toggle this panel",
  "app.shortcuts.rating": "Rating",
  "app.shortcuts.ratingAdjust": "Decrease / increase rating by 1",
  "app.shortcuts.ratingClear": "Clear rating",
  "app.shortcuts.ratingSet": "Set star rating",
  "app.shortcuts.title": "Keyboard Shortcuts",
  "app.sort.ariaLabel": "Sort photos",
  "app.sort.label": "Sort",
  "app.sort.modifiedAsc": "Modified (oldest first)",
  "app.sort.modifiedDesc": "Modified (newest first)",
  "app.sort.nameAsc": "Name (A → Z)",
  "app.sort.nameDesc": "Name (Z → A)",
  "app.sort.ratingAsc": "Rating (low to high)",
  "app.sort.ratingDesc": "Rating (high to low)",
  "app.status.scanning": "Scanning…",
  "app.tooltips.shortcuts": "Keyboard shortcuts (Shift + ?)",
  "main.sqliteError.message":
    "The better-sqlite3 native module is not available for this Electron build.\nReinstall dependencies and run `npm run rebuild-native`, then restart the app.",
  "main.sqliteError.title": "SQLite initialization error",
  "photoCard.error": "Unable to load image.",
  "photoCard.loading": "Loading",
  "photoGrid.empty": "Load a folder to start browsing photos.",
  "photoPreview.delete": "Delete photo",
  "photoPreview.empty": "Select a photo to preview.",
  "renameDialog.ariaLabel": "Rename file",
  "renameDialog.cancel": "Cancel",
  "renameDialog.description":
    "Enter a new file name. Include the extension to be sure.",
  "renameDialog.save": "Save",
  "renameDialog.saving": "Saving…",
  "renameDialog.title": "Rename file",
} as const;

const ja: typeof en = {
  "app.actions.clearFolder": "フォルダーを閉じる",
  "app.actions.loadFolder": "フォルダーを読み込み",
  "app.actions.openFolder": "フォルダーを開く",
  "app.confirm.delete": "「{{name}}」をゴミ箱に移動します。よろしいですか？",
  "app.context.delete": "削除",
  "app.context.rename": "ファイル名を変更",
  "app.context.reveal": "ファイルの場所を表示",
  "app.dialog.preview": "画像プレビュー",
  "app.directory.count": "{{count}} 枚",
  "app.directory.countSingular": "{{count}} 枚",
  "app.dnd.prompt": "ここにフォルダをドロップして読み込みます。",
  "app.dnd.unsupported": "ドロップできるのはフォルダのみです。",
  "app.dnd.emptyTitle": "フォルダをドラッグ",
  "app.dnd.emptyDescription":
    "フォルダを画像一覧にドロップすると、その中の画像が読み込まれます。",
  "app.empty.default": "フォルダをここにドラッグ＆ドロップすると画像が読み込まれます。",
  "app.empty.rated":
    "星評価が付いた画像が見つかりません。評価を付けるとここに表示されます。",
  "app.empty.unrated":
    "星評価が付いていない画像が見つかりません。評価をクリアするとここに表示されます。",
  "app.error.alreadyDeleted": "対象の画像は既に削除されています。",
  "app.error.delete": "削除に失敗しました。",
  "app.error.deleteUnexpected": "削除中に予期せぬエラーが発生しました。",
  "app.error.deleteWithReason": "削除に失敗しました: {{reason}}",
  "app.error.fileNotFound": "ファイルが見つかりません。",
  "app.error.rename": "ファイル名を変更できませんでした。",
  "app.error.renameConflict": "同名のファイルが既に存在します。",
  "app.error.renameEmpty": "ファイル名を入力してください。",
  "app.error.renameForbiddenCharacters":
    "ファイル名にスラッシュは使用できません。",
  "app.error.renameInvalid": "この名前は使用できません。",
  "app.error.renameWithReason": "ファイル名を変更できませんでした: {{reason}}",
  "app.error.reveal": "ファイルの場所を表示できませんでした。",
  "app.error.revealNotFound": "ファイルが見つかりませんでした。",
  "app.error.revealWithReason":
    "ファイルの場所を表示できませんでした: {{reason}}",
  "app.error.unknown": "不明なエラーが発生しました。",
  "app.filter.all": "すべて ({{count}})",
  "app.filter.label": "表示フィルター",
  "app.filter.rated": "★あり ({{count}})",
  "app.filter.ratedDisabled": "星評価が付いた画像がありません",
  "app.filter.stars.label": "評価でフィルター",
  "app.filter.stars.none": "評価なし",
  "app.filter.unrated": "★なし ({{count}})",
  "app.filter.unratedDisabled": "星評価が付いていない画像がありません",
  "app.language.ariaLabel": "言語を選択",
  "app.language.label": "言語",
  "app.preview.resizeHandle": "プレビュー幅の調整ハンドル",
  "app.shortcuts.actions": "操作",
  "app.shortcuts.actionsClose": "ショートカット一覧を閉じる",
  "app.shortcuts.actionsDelete": "選択中の画像を削除",
  "app.shortcuts.actionsFilter":
    "表示フィルターを切り替え (すべて / 星あり / 星なし)",
  "app.shortcuts.actionsLoadFolder": "フォルダーを読み込み",
  "app.shortcuts.ariaLabel": "キーボードショートカット",
  "app.shortcuts.button": "ショートカット",
  "app.shortcuts.close": "閉じる",
  "app.shortcuts.display": "表示",
  "app.shortcuts.displayToggleSort": "並び替えを切り替え",
  "app.shortcuts.navigation": "ナビゲーション",
  "app.shortcuts.navigationJump": "表示中リストの先頭 / 末尾へ移動",
  "app.shortcuts.navigationMove": "前 / 次の画像へ移動",
  "app.shortcuts.navigationToggle": "このパネルを開閉",
  "app.shortcuts.rating": "評価",
  "app.shortcuts.ratingAdjust": "評価を 1 段階下げる / 上げる",
  "app.shortcuts.ratingClear": "評価をクリア",
  "app.shortcuts.ratingSet": "星評価を設定",
  "app.shortcuts.title": "キーボードショートカット",
  "app.sort.ariaLabel": "画像の並び替え",
  "app.sort.label": "並び替え",
  "app.sort.modifiedAsc": "更新日 (古い順)",
  "app.sort.modifiedDesc": "更新日 (新しい順)",
  "app.sort.nameAsc": "名前 (昇順)",
  "app.sort.nameDesc": "名前 (降順)",
  "app.sort.ratingAsc": "評価 (低い順)",
  "app.sort.ratingDesc": "評価 (高い順)",
  "app.status.scanning": "スキャン中…",
  "app.tooltips.shortcuts": "キーボードショートカット (Shift + ?)",
  "main.sqliteError.message":
    "better-sqlite3 のネイティブモジュールが現在の Electron で利用できません。\n依存関係を再インストール後、`npm run rebuild-native` を実行して再起動してください。",
  "main.sqliteError.title": "SQLite 初期化エラー",
  "photoCard.error": "画像を読み込めませんでした。",
  "photoCard.loading": "読み込み中",
  "photoGrid.empty": "フォルダを読み込むと写真が表示されます。",
  "photoPreview.delete": "画像を削除",
  "photoPreview.empty": "プレビューする写真を選択してください。",
  "renameDialog.ariaLabel": "ファイル名を変更",
  "renameDialog.cancel": "キャンセル",
  "renameDialog.description":
    "新しいファイル名を入力してください。拡張子も含めて指定すると確実です。",
  "renameDialog.save": "保存",
  "renameDialog.saving": "保存中…",
  "renameDialog.title": "ファイル名を変更",
} as const;

const translations: Record<Locale, typeof en> = {
  en,
  ja,
};

export type TranslationKey = keyof typeof en;
export type TranslationValues = Record<string, string | number>;

function formatTemplate(template: string, values: TranslationValues): string {
  return template.replace(/\{\{(.*?)\}\}/g, (_match, token) => {
    const key = String(token).trim();
    const value = values[key];
    return value === undefined ? "" : String(value);
  });
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  values: TranslationValues = {},
): string {
  const bundle = translations[locale] ?? translations[defaultLocale];
  const template = bundle[key] ?? translations.en[key];
  if (!template) {
    return key;
  }
  return formatTemplate(template, values);
}

export function getAvailableLocales(): Locale[] {
  return [...supportedLocales];
}

export function getLocaleLabel(locale: Locale): string {
  return localeLabels[locale] ?? locale;
}

export function getIntlLocale(locale: Locale): string {
  return intlLocaleMap[locale] ?? intlLocaleMap[defaultLocale];
}

export function resolveLocale(input?: string | null): Locale {
  if (!input) {
    return defaultLocale;
  }
  const normalized = input.toLowerCase();
  if (normalized.startsWith("en")) {
    return "en";
  }
  if (normalized.startsWith("ja")) {
    return "ja";
  }
  return defaultLocale;
}

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && supportedLocales.includes(value as Locale)
  );
}

export function formatPhotoCount(locale: Locale, count: number): string {
  const formatter = new Intl.NumberFormat(getIntlLocale(locale));
  const amount = formatter.format(count);
  if (locale === "en" && count === 1) {
    return translate(locale, "app.directory.countSingular", { count: amount });
  }
  return translate(locale, "app.directory.count", { count: amount });
}

export interface LocaleDescriptor {
  locale: Locale;
}
