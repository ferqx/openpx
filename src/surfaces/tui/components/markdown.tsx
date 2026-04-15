import React from "react";
const { default: InkMarkdown } = await import("ink-markdown");

/** Markdown：对 ink-markdown 的极薄包装，统一在一处导入 */
export function Markdown({ children }: { children: string }) {
  return <InkMarkdown>{children}</InkMarkdown>;
}
