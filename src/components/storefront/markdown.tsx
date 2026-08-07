import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  return (
    <div className="prose prose-invert prose-neutral max-w-none prose-headings:font-semibold">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
