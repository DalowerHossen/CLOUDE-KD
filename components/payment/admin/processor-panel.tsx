// path: components/payment/admin/processor-panel.tsx
'use client';
import { useCallback, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { LoadingState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import type { ProcessorDetail, ProcessorSummary } from '@/services/payment/processors';

const errorBody = z.object({
  error: z.object({ code: z.string().optional(), message: z.string() }),
});
const dataBody = z.object({ data: z.object({ id: z.string() }).passthrough() });
const okBody = z.object({ data: z.unknown() });

type Feedback = { ok: boolean; text: string } | null;

export function ProcessorPanel({ summary }: { summary: ProcessorSummary }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ProcessorDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/processors/${summary.id}`, { cache: 'no-store' });
      const json: unknown = await response.json().catch(() => null);
      const parsed = dataBody.safeParse(json);
      if (response.ok && parsed.success) setDetail(parsed.data.data as unknown as ProcessorDetail);
      else {
        // Say why when the server said why (for example a blocked network address), not only that loading failed.
        const failed = errorBody.safeParse(json);
        setFeedback({
          ok: false,
          text: failed.success
            ? `${t('s10Processors.loadError')} ${failed.data.error.message}`
            : t('s10Processors.loadError'),
        });
      }
    } catch {
      setFeedback({ ok: false, text: t('s10Processors.loadError') });
    } finally {
      setLoading(false);
    }
  }, [summary.id]);

  function toggle(): void {
    const next = !open;
    setOpen(next);
    if (next && summary.available && !detail) void load();
  }

  async function act(body: Record<string, unknown>): Promise<unknown> {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/processors/${summary.id}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = errorBody.safeParse(json);
        const needsStepUp = parsed.success && parsed.data.error.code === 'step_up_required';
        setFeedback({
          ok: false,
          text: needsStepUp
            ? t('s10Processors.actions.needStepUp')
            : parsed.success
              ? parsed.data.error.message
              : t('s10Processors.actions.failed'),
        });
        return null;
      }
      await load();
      return okBody.parse(json).data;
    } catch {
      setFeedback({ ok: false, text: t('s10Processors.actions.failed') });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createWebhooks(): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/processors/${summary.id}/webhooks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        setFeedback({ ok: true, text: t('s10Processors.webhook.created') });
        await load();
      } else {
        const parsed = errorBody.safeParse(json);
        setFeedback({
          ok: false,
          text: parsed.success ? parsed.data.error.message : t('s10Processors.actions.failed'),
        });
      }
    } catch {
      setFeedback({ ok: false, text: t('s10Processors.actions.failed') });
    } finally {
      setBusy(false);
    }
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!detail) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const values: Record<string, string> = {};
    for (const field of detail.fields) {
      const raw = String(data.get(field.key) ?? '').trim();
      if (raw !== '') values[field.key] = raw;
    }
    const result = await act({
      action: 'save_credentials',
      values,
      expectedVersion: detail.version,
    });
    if (result !== null) {
      form.reset();
      setFeedback({ ok: true, text: t('s10Processors.actions.done') });
    }
  }

  async function runTest(modeId?: string): Promise<void> {
    const result = await act(modeId ? { action: 'test', modeId } : { action: 'test' });
    const parsed = z.object({ ok: z.boolean(), message: z.string() }).safeParse(result);
    if (parsed.success) {
      setFeedback({
        ok: parsed.data.ok,
        text: parsed.data.ok
          ? t('s10Processors.actions.testOk')
          : t('s10Processors.actions.testBad', { message: parsed.data.message }),
      });
    }
  }

  async function switchTo(modeId: string, version: number): Promise<void> {
    const result = await act({ action: 'switch_mode', modeId, expectedVersion: version });
    if (result !== null) setFeedback({ ok: true, text: t('s10Processors.modes.switched') });
  }

  const state = detail ?? null;
  const connected = state ? state.credentialsVersion > 0 : summary.hasCredentials;
  const enabled = state ? state.enabled : summary.enabled;

  return (
    <section
      className="rounded-lg border bg-card text-card-foreground"
      aria-labelledby={`p-${summary.id}`}
    >
      <div className="flex flex-col gap-sp-12 p-sp-16 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 id={`p-${summary.id}`} className="text-lg font-semibold">
            {summary.name}
          </h2>
          <div className="flex flex-wrap gap-2">
            {!summary.available ? (
              <Badge variant="secondary">{t('s10Processors.notAvailable')}</Badge>
            ) : enabled ? (
              <Badge variant="success">{t('s10Processors.statuses.enabled')}</Badge>
            ) : connected ? (
              <Badge variant="warning">{t('s10Processors.statuses.disabled')}</Badge>
            ) : (
              <Badge variant="outline">{t('s10Processors.statuses.notConnected')}</Badge>
            )}
            {summary.available && summary.environment ? (
              <Badge variant="outline">
                {t(`s10Processors.environment.${summary.environment}`)}
              </Badge>
            ) : null}
            {summary.lastTestOk === true ? (
              <Badge variant="success">{t('s10Processors.statuses.testPassed')}</Badge>
            ) : null}
            {summary.lastTestOk === false ? (
              <Badge variant="destructive">{t('s10Processors.statuses.testFailed')}</Badge>
            ) : null}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`panel-${summary.id}`}
        >
          {open ? t('s01Core.common.close') : t('s10Processors.credentials.title')}
        </Button>
      </div>
      {open ? (
        <div id={`panel-${summary.id}`} className="space-y-sp-16 border-t p-sp-16">
          {!summary.available ? (
            <p className="text-sm text-muted-foreground">{t('s10Processors.notAvailableHelp')}</p>
          ) : loading && !state ? (
            <LoadingState rows={3} />
          ) : state ? (
            <>
              <div className="flex flex-wrap gap-3 text-sm">
                <a
                  className="underline"
                  href={state.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('s10Processors.docs')}
                </a>
                {state.sandboxUrl ? (
                  <a
                    className="underline"
                    href={state.sandboxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('s10Processors.sandbox')}
                  </a>
                ) : null}
              </div>
              {state.disabledReason && !state.enabled ? (
                <p className="text-sm text-muted-foreground">{state.disabledReason}</p>
              ) : null}
              <div className="space-y-1 rounded-md border p-sp-12 text-sm">
                <p className="font-medium">{t('s10Processors.webhook.title')}</p>
                <p className="break-all font-mono text-caption">{state.webhookUrl}</p>
                <p className="text-caption text-muted-foreground">
                  {t('s10Processors.webhook.help', { name: summary.name })}
                </p>
                {state.canCreateWebhooks ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void createWebhooks()}
                  >
                    {t('s10Processors.webhook.create', { name: summary.name })}
                  </Button>
                ) : null}
              </div>
              <form
                onSubmit={(e) => void submitCredentials(e)}
                className="space-y-sp-12"
                autoComplete="off"
              >
                <p className="text-sm text-muted-foreground">
                  {t('s10Processors.credentials.help')}
                </p>
                {state.credentialsVersion > 0 ? (
                  <p className="text-sm">
                    {t('s10Processors.credentials.version', { version: state.credentialsVersion })}
                    {state.credentialsUpdatedAt
                      ? ` - ${t('s10Processors.credentials.updated', { time: state.credentialsUpdatedAt.replace('T', ' ').slice(0, 19) })}`
                      : ''}
                  </p>
                ) : null}
                {state.fields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <Label htmlFor={`${summary.id}-${field.key}`}>
                      {field.label}
                      {field.required ? ' *' : ''}
                    </Label>
                    <Input
                      id={`${summary.id}-${field.key}`}
                      name={field.key}
                      type={field.secret ? 'password' : 'text'}
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={4000}
                      placeholder={
                        field.saved ? (field.display ?? t('s10Processors.credentials.saved')) : ''
                      }
                    />
                    {field.helpText ? (
                      <p className="text-caption text-muted-foreground">{field.helpText}</p>
                    ) : null}
                  </div>
                ))}
                <Button type="submit" disabled={busy}>
                  {t('s10Processors.credentials.save')}
                </Button>
              </form>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`${summary.id}-env`}>
                    {t('s10Processors.environment.label')}
                  </Label>
                  <NativeSelect
                    id={`${summary.id}-env`}
                    value={state.environment ?? 'sandbox'}
                    disabled={busy}
                    onChange={(e) =>
                      void act({
                        action: 'set_environment',
                        environment: e.target.value,
                        expectedVersion: state.version,
                      })
                    }
                  >
                    <option value="sandbox">{t('s10Processors.environment.sandbox')}</option>
                    <option value="live">{t('s10Processors.environment.live')}</option>
                  </NativeSelect>
                </div>
                <Button
                  variant="outline"
                  disabled={busy || !connected}
                  onClick={() => void runTest()}
                >
                  {busy ? t('s10Processors.actions.working') : t('s10Processors.actions.test')}
                </Button>
                {state.enabled ? (
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void act({ action: 'disable', expectedVersion: state.version })}
                  >
                    {t('s10Processors.actions.disable')}
                  </Button>
                ) : (
                  <Button
                    disabled={
                      busy || !connected || state.lastTestOk !== true || !summary.hasSecureForm
                    }
                    onClick={() => void act({ action: 'enable', expectedVersion: state.version })}
                  >
                    {t('s10Processors.actions.enable')}
                  </Button>
                )}
              </div>
              {!summary.hasSecureForm ? (
                <p className="text-xs text-destructive">{t('s10Processors.noSecureForm')}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {t('s10Processors.environment.changeHelp')}
              </p>
              <ul
                className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
                aria-label={t('s10Processors.capabilities.title')}
              >
                {state.capabilities.threeDS ? (
                  <li>{t('s10Processors.capabilities.threeDS')}</li>
                ) : null}
                {state.capabilities.authCapture ? (
                  <li>{t('s10Processors.capabilities.authCapture')}</li>
                ) : null}
                {state.capabilities.refund ? (
                  <li>{t('s10Processors.capabilities.refund')}</li>
                ) : null}
                {state.capabilities.partialRefund ? (
                  <li>{t('s10Processors.capabilities.partialRefund')}</li>
                ) : null}
                {state.capabilities.merchantOfRecord ? (
                  <li>{t('s10Processors.capabilities.merchantOfRecord')}</li>
                ) : null}
              </ul>
              {state.modes.length > 1 ? (
                <div className="space-y-sp-8 border-t pt-sp-12">
                  <h3 className="font-medium">{t('s10Processors.modes.title')}</h3>
                  <p className="text-sm text-muted-foreground">{t('s10Processors.modes.help')}</p>
                  <ul className="space-y-sp-8">
                    {state.modes.map((mode) => (
                      <li
                        key={mode.id}
                        className="flex flex-col gap-2 rounded-md border p-sp-12 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1">
                          <p className="font-medium">
                            {mode.label}{' '}
                            {mode.isActive ? (
                              <Badge variant="success">{t('s10Processors.modes.active')}</Badge>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {mode.lastTest
                              ? t('s10Processors.modes.lastTest', {
                                  result: mode.lastTest.ok
                                    ? t('s10Processors.modes.passed')
                                    : t('s10Processors.modes.failed'),
                                  time: mode.lastTest.at.replace('T', ' ').slice(0, 19),
                                })
                              : t('s10Processors.modes.noTest')}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || !connected}
                            onClick={() => void runTest(mode.id)}
                          >
                            {t('s10Processors.modes.testMode')}
                          </Button>
                          {!mode.isActive ? (
                            <Button
                              size="sm"
                              disabled={busy || mode.lastTest?.ok !== true}
                              onClick={() => void switchTo(mode.id, state.version)}
                            >
                              {t('s10Processors.modes.switchTo')}
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
          {feedback ? (
            <Alert variant={feedback.ok ? 'success' : 'destructive'}>{feedback.text}</Alert>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
