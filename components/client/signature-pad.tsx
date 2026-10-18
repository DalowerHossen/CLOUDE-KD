// path: components/client/signature-pad.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

interface SignaturePadProps {
  /** Called with a PNG data URL when there is a drawing, or null when the pad is empty. */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}

/** A touch-friendly drawing pad. Pointer events cover mouse, pen and finger; the page does not scroll while drawing. */
export function SignaturePad({ onChange, disabled = false }: SignaturePadProps): JSX.Element {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [inked, setInked] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const el = event.currentTarget;
    const box = el.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * el.width,
      y: ((event.clientY - box.top) / box.height) * el.height,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (disabled) return;
    const ctx = event.currentTarget.getContext('2d');
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!drawing.current) return;
    drawing.current = false;
    setInked(true);
    onChange(event.currentTarget.toDataURL('image/png'));
  }

  function clear(): void {
    const el = canvas.current;
    el?.getContext('2d')?.clearRect(0, 0, el.width, el.height);
    setInked(false);
    onChange(null);
  }

  return (
    <div className="space-y-sp-8">
      <canvas
        ref={canvas}
        width={600}
        height={200}
        role="img"
        aria-label={t('s13Portal.sign.padLabel')}
        className="h-40 w-full touch-none rounded-md border bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <div className="flex items-center justify-between">
        <p className="text-caption text-muted-foreground">{t('s13Portal.sign.padHelp')}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clear}
          disabled={disabled || !inked}
        >
          {t('s13Portal.sign.clear')}
        </Button>
      </div>
    </div>
  );
}
