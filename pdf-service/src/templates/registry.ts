/**
 * Template registry — maps a TemplateId to its React component.
 *
 * Adding a template = write the component, add one line here. The renderer
 * never hard-codes a template name.
 */
import type { ComponentType } from "react";

import type { RenderRequest, TemplateId } from "../contract.js";
import { Modern } from "./Modern.js";

export const TEMPLATES: Record<TemplateId, ComponentType<RenderRequest>> = {
  modern: Modern,
  // Stage 7 ships the real Classic template. Until then `classic` renders
  // Modern so the id is never a hard error — the picker just shows one look.
  classic: Modern,
};
