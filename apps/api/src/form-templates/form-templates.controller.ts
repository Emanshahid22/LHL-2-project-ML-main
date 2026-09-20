import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { FORM_TEMPLATES, FormTemplate, getFormTemplate } from '@mgs/shared';
import { Requires } from '../auth/requires.decorator';

/**
 * Serves the template catalogue defined in libs/shared. Templates ship with
 * the codebase (not the DB) so both apps share one source of truth; serving
 * them over HTTP keeps the client decoupled and lets it retry on failure.
 */
@Controller('form-templates')
@Requires('forms.read')
export class FormTemplatesController {
  @Get()
  list(): readonly FormTemplate[] {
    return FORM_TEMPLATES;
  }

  @Get(':code')
  get(@Param('code') code: string): FormTemplate {
    const template = getFormTemplate(code.toUpperCase());
    if (!template) {
      throw new NotFoundException(`Unknown form template: ${code}`);
    }
    return template;
  }
}
