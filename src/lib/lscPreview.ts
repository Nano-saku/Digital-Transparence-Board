export const LSC_PREVIEW_FILES = Array.from(
  { length: 18 },
  (_, index) => `/${index + 1}.jpg`,
);

export function isLscPreviewFileReference(
  value: unknown,
): value is string {
  return typeof value === "string" && LSC_PREVIEW_FILES.includes(value);
}

export function normalizeLscPreviewFileReference(
  value: unknown,
): string | undefined {
  return isLscPreviewFileReference(value) ? value : undefined;
}
