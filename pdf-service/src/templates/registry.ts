/**
 * Template registry — maps a TemplateId to its React component.
 *
 * Adding a template = write the component, add one line here. The renderer
 * never hard-codes a template name.
 */
import type { ComponentType } from "react";

import type { RenderRequest, TemplateId } from "../contract.js";
import { Classic } from "./Classic.js";
import { Modern } from "./Modern.js";

export const TEMPLATES: Record<TemplateId, ComponentType<RenderRequest>> = {
  modern: Modern,
  classic: Classic,
};
