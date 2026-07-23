import { z } from "zod";
import { t } from "@/lib/i18n";

/** Board editor validation. Public title is the one hard requirement. */
export const boardFormSchema = z.object({
  internal_name: z.string().max(120).optional().default(""),
  public_title: z.string().trim().min(1, "יש להזין כותרת ציבורית לפני שמירה").max(120),
  public_subtitle: z.string().max(200).optional().default(""),
  internal_description: z.string().max(500).optional().default(""),
});

export type BoardFormValues = z.infer<typeof boardFormSchema>;

/** Participant submission validation, applied on client and (conceptually) server. */
export function validateSubmissionText(text: string, limit: number): string | null {
  const trimmed = text.trim();
  if (!trimmed) return t("יש לכתוב תשובה לפני השליחה");
  if (trimmed.length > limit) return t("התשובה ארוכה מדי — עד {limit} תווים", { limit });
  return null;
}
