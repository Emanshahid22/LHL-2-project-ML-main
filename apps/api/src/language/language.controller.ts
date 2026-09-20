import { Body, Controller, Post } from '@nestjs/common';
import type { LanguagePromptsRequest, LanguagePromptsResponse } from '@mgs/shared';
import { LanguageAssistClient } from './language-assist.client';
import { Requires } from '../auth/requires.decorator';

/**
 * UC-06: the optional assistance proxy.
 *
 * The panel does not need this endpoint to work — the informal-language and
 * completeness rules are pure and run in the browser from libs/shared. This adds
 * whatever an external service contributes, and answers `enabled: false` when
 * none is configured so the client can stop asking.
 *
 * It always returns 200. A 5xx here would put a red line in the browser console
 * for a feature the scope says must degrade "with no errors surfaced to user",
 * so failure is reported as data (`degraded: true`) rather than as a status.
 *
 * There is no draft id in the request and no write path out of this module.
 */
@Controller('language')
@Requires('forms.edit')
export class LanguageController {
  constructor(private readonly client: LanguageAssistClient) {}

  @Post('prompts')
  async prompts(@Body() body: LanguagePromptsRequest): Promise<LanguagePromptsResponse> {
    const text = typeof body?.text === 'string' ? body.text : '';
    return this.client.prompts(text);
  }
}
