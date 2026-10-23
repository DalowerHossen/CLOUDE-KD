// path: components/admin/shared/conflict-dialog.tsx
'use client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { t } from '@/lib/i18n';

export interface FieldDifference {
  field: string;
  yours: string;
  theirs: string;
}

interface Props {
  open: boolean;
  differences: readonly FieldDifference[];
  onReload: () => void;
  onKeepMine: () => void;
  onCancel: () => void;
}

/** Shown when a save fails with a version conflict (HTTP 409, code "conflict"). */
export function ConflictDialog({
  open,
  differences,
  onReload,
  onKeepMine,
  onCancel,
}: Props): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('s02Governance.conflict.title')}</DialogTitle>
          <DialogDescription>{t('s02Governance.conflict.body')}</DialogDescription>
        </DialogHeader>
        {differences.length > 0 ? (
          <div className="max-h-64 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('s02Governance.conflict.title')}</caption>
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="p-2">
                    {t('s02Governance.conflict.fieldColumn')}
                  </th>
                  <th scope="col" className="p-2">
                    {t('s02Governance.conflict.yoursColumn')}
                  </th>
                  <th scope="col" className="p-2">
                    {t('s02Governance.conflict.theirsColumn')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {differences.map((d) => (
                  <tr key={d.field} className="border-b last:border-0">
                    <th scope="row" className="p-2 font-medium">
                      {d.field}
                    </th>
                    <td className="break-words p-2">{d.yours}</td>
                    <td className="break-words p-2">{d.theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('s02Governance.conflict.cancel')}
          </Button>
          <Button type="button" variant="outline" onClick={onReload}>
            {t('s02Governance.conflict.reload')}
          </Button>
          <Button type="button" onClick={onKeepMine}>
            {t('s02Governance.conflict.keepMine')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
