import { z } from 'zod';

export const documentAppearance = {
  fontTextSize: { default: 18, min: 12, max: 36 },
  fileLineWidth: { default: 700, min: 320, max: 2000 },
} as const;

/** Milliseconds after a keystroke during which trackpad/mouse presses are ignored. */
export const typingPointerGuardDelay = { default: 1000, min: 100, max: 3000 } as const;

export const UiSettingsSchema = z.object({
  theme: z.enum(['shale-dark', 'shale-light']).default('shale-light'),
  defaultView: z.enum(['live', 'source', 'reading']).default('live'),
  debugRecording: z.boolean().default(false),
  debugSource: z.boolean().default(true),
  ctrlWheelFontSize: z.boolean().default(false),
  vimEnabled: z.boolean().default(false),
  vimInputMethod: z.boolean().default(true),
  vimEnglishSource: z.string().max(256).default(''),
  vimCursorLight: z.string().regex(/^(?:#[0-9a-fA-F]{6})?$/).default(''),
  vimCursorDark: z.string().regex(/^(?:#[0-9a-fA-F]{6})?$/).default(''),
  typingPointerGuard: z.boolean().default(false),
  typingPointerGuardMs: z.number().int().min(typingPointerGuardDelay.min).max(typingPointerGuardDelay.max)
    .default(typingPointerGuardDelay.default),
  fontTextSize: z.number().int().min(documentAppearance.fontTextSize.min).max(documentAppearance.fontTextSize.max)
    .default(documentAppearance.fontTextSize.default),
  fileLineWidth: z.number().int().min(documentAppearance.fileLineWidth.min).max(documentAppearance.fileLineWidth.max)
    .default(documentAppearance.fileLineWidth.default),
});

export type UiSettings = z.infer<typeof UiSettingsSchema>;
export const defaultUiSettings = UiSettingsSchema.parse({});
