import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { STORAGE_PREFIX } from "@/lib/note-images";
import { cn } from "@/lib/utils";

/**
 * Markdown-Anzeige. Rohes HTML wird nicht gerendert (react-markdown-Standard),
 * gefährliche Links (javascript: …) filtert defaultUrlTransform.
 */
export function Markdown({
  content,
  imageUrls = {},
  className,
}: {
  content: string | null | undefined;
  imageUrls?: Record<string, string>;
  className?: string;
}) {
  if (!content?.trim()) return null;

  return (
    <div
      className={cn(
        "max-w-none text-sm leading-relaxed break-words",
        "[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold",
        "[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold",
        "[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:font-semibold",
        "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
        "[&_li:has(>input)]:list-none [&_li>input]:mr-2 [&_li>input]:align-middle",
        "[&_a]:underline [&_a]:underline-offset-4 [&_strong]:font-semibold",
        "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
        "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3",
        "[&_table]:my-3 [&_table]:w-full [&_table]:text-left [&_th]:border-b [&_th]:py-1 [&_th]:pr-3 [&_td]:border-b [&_td]:py-1 [&_td]:pr-3",
        "[&_hr]:my-4 [&_img]:my-3 [&_img]:rounded-md [&_img]:border",
        "[&>*:first-child]:mt-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith(STORAGE_PREFIX) ? url : defaultUrlTransform(url))}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ src, alt }) => {
            const raw = typeof src === "string" ? src : "";
            const resolved = raw.startsWith(STORAGE_PREFIX) ? imageUrls[raw.slice(STORAGE_PREFIX.length)] : raw;
            if (!resolved) return <span className="text-xs text-muted-foreground">[Bild nicht verfügbar]</span>;
            // eslint-disable-next-line @next/next/no-img-element -- signierte Supabase-URLs
            return <img src={resolved} alt={alt ?? ""} loading="lazy" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
