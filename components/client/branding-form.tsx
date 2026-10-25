// path: components/client/branding-form.tsx
'use client';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { FONT_KEYS } from '@/lib/company/sections';
import { t } from '@/lib/i18n';
import { checkBrandColors, themeCssVars, type FontKey } from '@/lib/branding/theme';

const brandShape = z.object({
  primaryColor: z.string(),
  secondaryColor: z.string(),
  accentColor: z.string(),
  fontKey: z.enum(FONT_KEYS),
  emailSignature: z.string(),
  clientFooter: z.string(),
});
const viewShape = z.object({
  data: z.object({
    brand: brandShape,
    logoUrl: z.string().nullable(),
    whiteLabel: z.boolean(),
    version: z.number(),
    file: z.unknown(),
  }),
});
const historyShape = z.object({
  data: z.array(z.object({ id: z.string(), action: z.string(), at: z.string() })),
});
const errorShape = z.object({ error: z.object({ message: z.string() }) });

type Brand = z.infer<typeof brandShape>;
type Loaded = z.infer<typeof viewShape>['data'] & {
  history: { id: string; action: string; at: string }[];
};
type Notice = { ok: boolean; text: string } | null;

/** Brand editor with a live preview of a client page, an accessibility check, reset, export, import and history. */
export function BrandingForm(): JSX.Element {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [file, setFile] = useState<unknown>(null);
  const [history, setHistory] = useState<{ id: string; action: string; at: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const fetchAll = useCallback(async (): Promise<Loaded | null> => {
    try {
      const [a, b] = await Promise.all([
        fetch('/api/portal/branding', { cache: 'no-store' }),
        fetch('/api/portal/branding/history', { cache: 'no-store' }),
      ]);
      const view = viewShape.safeParse(await a.json());
      if (!a.ok || !view.success) return null;
      const past = historyShape.safeParse(await b.json());
      return { ...view.data.data, history: past.success ? past.data.data.slice(0, 10) : [] };
    } catch {
      return null;
    }
  }, []);

  const apply = useCallback((loaded: Loaded | null): void => {
    if (!loaded) {
      setNotice({ ok: false, text: t('s13Portal.branding.loadFailed') });
      return;
    }
    setBrand(loaded.brand);
    setLogoUrl(loaded.logoUrl);
    setVersion(loaded.version);
    setFile(loaded.file);
    setHistory(loaded.history);
  }, []);

  const load = useCallback(async (): Promise<void> => apply(await fetchAll()), [apply, fetchAll]);

  useEffect(() => {
    let cancelled = false;
    void fetchAll().then((loaded) => {
      if (!cancelled) apply(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [apply, fetchAll]);

  const issues = useMemo(() => (brand ? checkBrandColors(brand) : []), [brand]);

  async function send(path: string, method: string, body: unknown, done: string): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = errorShape.safeParse(json);
        throw new Error(
          parsed.success ? parsed.data.error.message : t('s13Portal.branding.saveFailed'),
        );
      }
      setNotice({ ok: true, text: done });
      await load();
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s13Portal.branding.saveFailed'),
      });
    }
    setBusy(false);
  }

  function exportFile(): void {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'branding.json';
    link.rel = 'noopener noreferrer';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(chosen: File | undefined): Promise<void> {
    if (!chosen || chosen.size > 20_000) {
      setNotice({ ok: false, text: t('s13Portal.branding.importFailed') });
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await chosen.text());
      await send(
        '/api/portal/branding/import',
        'POST',
        { expectedVersion: version, file: parsed },
        t('s13Portal.branding.imported'),
      );
    } catch {
      setNotice({ ok: false, text: t('s13Portal.branding.importFailed') });
    }
  }

  if (!brand)
    return (
      <Alert variant={notice ? 'destructive' : 'default'}>
        {notice?.text ?? t('s13Portal.branding.loading')}
      </Alert>
    );
  const set = (patch: Partial<Brand>): void => setBrand({ ...brand, ...patch });
  const preview = themeCssVars({ ...brand, fontKey: brand.fontKey as FontKey }) as CSSProperties;
  const color = (
    id: string,
    label: string,
    key: 'primaryColor' | 'secondaryColor' | 'accentColor',
  ): JSX.Element => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-sp-8">
        <input
          id={id}
          type="color"
          value={brand[key]}
          onChange={(e) => set({ [key]: e.target.value })}
          className="h-10 w-14 rounded border"
          disabled={busy}
        />
        <Input
          value={brand[key]}
          onChange={(e) => set({ [key]: e.target.value })}
          maxLength={7}
          aria-label={label}
          disabled={busy}
        />
      </div>
    </div>
  );

  return (
    <div className="grid gap-sp-16 lg:grid-cols-2">
      <form
        className="space-y-sp-12"
        onSubmit={(event) => {
          event.preventDefault();
          void send(
            '/api/portal/branding',
            'PUT',
            { expectedVersion: version, brand },
            t('s13Portal.branding.saved'),
          );
        }}
      >
        {notice ? (
          <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert>
        ) : null}
        {issues.map((issue) => (
          <Alert key={issue.field} variant="destructive">
            {issue.message}
          </Alert>
        ))}
        {color('brand-primary', t('s13Portal.branding.primary'), 'primaryColor')}
        {color('brand-secondary', t('s13Portal.branding.secondary'), 'secondaryColor')}
        {color('brand-accent', t('s13Portal.branding.accent'), 'accentColor')}
        <div className="space-y-1">
          <Label htmlFor="brand-font">{t('s13Portal.branding.font')}</Label>
          <NativeSelect
            id="brand-font"
            value={brand.fontKey}
            onChange={(e) => set({ fontKey: e.target.value as FontKey })}
            disabled={busy}
          >
            {FONT_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`s13Portal.branding.fonts.${key}` as 's13Portal.branding.fonts.system')}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="brand-footer">{t('s13Portal.branding.footer')}</Label>
          <Input
            id="brand-footer"
            value={brand.clientFooter}
            onChange={(e) => set({ clientFooter: e.target.value })}
            maxLength={500}
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="brand-signature">{t('s13Portal.branding.signature')}</Label>
          <Textarea
            id="brand-signature"
            value={brand.emailSignature}
            onChange={(e) => set({ emailSignature: e.target.value })}
            maxLength={2000}
            rows={4}
            disabled={busy}
          />
        </div>
        <div className="flex flex-wrap gap-sp-8">
          <Button type="submit" disabled={busy || issues.length > 0}>
            {t('s13Portal.branding.save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void send(
                '/api/portal/branding/reset',
                'POST',
                { expectedVersion: version },
                t('s13Portal.branding.resetDone'),
              )
            }
          >
            {t('s13Portal.branding.reset')}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={exportFile}>
            {t('s13Portal.branding.export')}
          </Button>
          <Label className="inline-flex cursor-pointer items-center rounded-md border px-sp-12 py-2 text-sm">
            {t('s13Portal.branding.import')}
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              disabled={busy}
              onChange={(e) => void importFile(e.target.files?.[0])}
            />
          </Label>
        </div>
      </form>
      <div className="space-y-sp-12">
        <Card style={preview} className="bg-background text-foreground">
          <CardHeader>
            <CardTitle>{t('s13Portal.branding.previewTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-sp-12">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="max-h-12 w-auto" width={160} height={48} />
            ) : null}
            <p className="text-sm">{t('s13Portal.branding.previewBody')}</p>
            <Button type="button" tabIndex={-1}>
              {t('s13Portal.invoice.pay')}
            </Button>
            <span
              className="ml-sp-8 inline-block rounded px-sp-8 py-1 text-caption text-white"
              style={{ backgroundColor: brand.accentColor }}
            >
              {t('s13Portal.invoice.statusPaid')}
            </span>
            {brand.clientFooter ? (
              <p className="text-caption text-muted-foreground">{brand.clientFooter}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('s13Portal.branding.historyTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('s13Portal.branding.historyEmpty')}
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {history.map((h) => (
                  <li key={h.id}>
                    {h.at.replace('T', ' ').slice(0, 16)} - {h.action}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
