// path: components/shared/ui-gallery.tsx
'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { t } from '@/lib/i18n';
import { PageHeader } from './page-header';
import { EmptyState, ErrorState, LoadingState, SuccessState } from './state-views';

const COLOR_ROLES = [
  'background',
  'foreground',
  'primary',
  'secondary',
  'muted',
  'accent',
  'destructive',
  'success',
  'warning',
  'info',
  'border',
] as const;

/** Development-only preview of the shared interface elements (design review and responsive checks). */
export function UiGallery(): JSX.Element {
  const [email, setEmail] = useState('');
  const error =
    email.length > 0 && !email.includes('@') ? 'Enter a valid email address.' : undefined;
  return (
    <div className="space-y-sp-32">
      <PageHeader
        title={t('s01Core.gallery.title')}
        description={t('s01Core.gallery.intro')}
        actions={<Button>{t('s01Core.common.create')}</Button>}
      />

      <section aria-labelledby="gallery-states" className="space-y-sp-16">
        <h2 id="gallery-states" className="text-h3 font-semibold">
          {t('s01Core.gallery.sectionStates')}
        </h2>
        <div className="grid gap-sp-16 lg:grid-cols-2">
          <LoadingState rows={2} />
          <ErrorState onRetry={() => undefined} reference="0190a000-0000-7000-8000-000000000000" />
          <EmptyState action={<Button variant="outline">{t('s01Core.common.create')}</Button>} />
          <SuccessState />
        </div>
      </section>

      <section aria-labelledby="gallery-buttons" className="space-y-sp-16">
        <h2 id="gallery-buttons" className="text-h3 font-semibold">
          {t('s01Core.gallery.sectionButtons')}
        </h2>
        <div className="flex flex-wrap items-center gap-sp-12">
          <Button>{t('s01Core.common.save')}</Button>
          <Button variant="secondary">{t('s01Core.common.cancel')}</Button>
          <Button variant="outline">{t('s01Core.common.edit')}</Button>
          <Button variant="ghost">{t('s01Core.common.view')}</Button>
          <Button variant="destructive">{t('s01Core.common.delete')}</Button>
          <Button loading>{t('s01Core.common.saving')}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-sp-8">
          <Badge>Draft</Badge>
          <Badge variant="secondary">Sent</Badge>
          <Badge variant="success">Paid</Badge>
          <Badge variant="warning">Overdue</Badge>
          <Badge variant="destructive">Void</Badge>
          <Badge variant="info">Viewed</Badge>
        </div>
      </section>

      <section aria-labelledby="gallery-forms" className="space-y-sp-16">
        <h2 id="gallery-forms" className="text-h3 font-semibold">
          {t('s01Core.gallery.sectionForms')}
        </h2>
        <Card>
          <CardHeader>
            <CardTitle>{t('s01Core.gallery.sampleInput')}</CardTitle>
            <CardDescription>{t('s01Core.gallery.sampleInputHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-sp-16">
            <FormField
              id="gallery-email"
              label={t('s01Core.gallery.sampleInput')}
              description={t('s01Core.gallery.sampleInputHint')}
              error={error}
              required
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </FormField>
            <div className="flex items-center gap-sp-12">
              <Switch id="gallery-switch" />
              <Label htmlFor="gallery-switch">{t('s01Core.gallery.sampleToggle')}</Label>
            </div>
            <div className="flex items-center gap-sp-12">
              <Checkbox id="gallery-check" />
              <Label htmlFor="gallery-check">{t('s01Core.gallery.sampleCheckbox')}</Label>
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="gallery-colors" className="space-y-sp-16">
        <h2 id="gallery-colors" className="text-h3 font-semibold">
          {t('s01Core.gallery.sectionColors')}
        </h2>
        <ul className="grid grid-cols-2 gap-sp-12 md:grid-cols-4">
          {COLOR_ROLES.map((role) => (
            <li key={role} className="overflow-hidden rounded-md border">
              <div className="h-12" style={{ backgroundColor: `hsl(var(--${role}))` }} />
              <p className="px-2 py-1 text-caption">{role}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
