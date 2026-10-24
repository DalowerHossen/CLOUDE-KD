// path: app/(admin)/admin/blog/_components/rich-editor.tsx
'use client';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/** Rich text editor of blog posts. The server cleans the HTML again before it is stored. */
export function RichEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled: boolean;
}): JSX.Element {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: false,
          HTMLAttributes: { rel: 'noopener noreferrer' },
        },
      }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'prose-content min-h-64 rounded-md border bg-background p-sp-12 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'aria-label': t('s06Public.blogAdmin.body'),
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });
  if (!editor) return <div className="min-h-64 rounded-md border" aria-busy="true" />;
  const tool = (label: string, active: boolean, run: () => void): JSX.Element => (
    <Button
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'outline'}
      aria-pressed={active}
      disabled={disabled}
      onClick={run}
    >
      {label}
    </Button>
  );
  function setLink(): void {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt(t('s06Public.blogAdmin.linkPrompt'), previous ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    if (/^(https:\/\/|mailto:|\/)/i.test(url))
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }
  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap gap-2"
        role="toolbar"
        aria-label={t('s06Public.blogAdmin.toolbar')}
      >
        {tool('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
        {tool('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
        {tool('H2', editor.isActive('heading', { level: 2 }), () =>
          editor.chain().focus().toggleHeading({ level: 2 }).run(),
        )}
        {tool('H3', editor.isActive('heading', { level: 3 }), () =>
          editor.chain().focus().toggleHeading({ level: 3 }).run(),
        )}
        {tool('List', editor.isActive('bulletList'), () =>
          editor.chain().focus().toggleBulletList().run(),
        )}
        {tool('Numbers', editor.isActive('orderedList'), () =>
          editor.chain().focus().toggleOrderedList().run(),
        )}
        {tool('Quote', editor.isActive('blockquote'), () =>
          editor.chain().focus().toggleBlockquote().run(),
        )}
        {tool('Code', editor.isActive('codeBlock'), () =>
          editor.chain().focus().toggleCodeBlock().run(),
        )}
        {tool('Link', editor.isActive('link'), setLink)}
        {tool('Undo', false, () => editor.chain().focus().undo().run())}
        {tool('Redo', false, () => editor.chain().focus().redo().run())}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
