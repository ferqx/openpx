import React from "react";
const { default: InkMarkdown } = await import("ink-markdown");

export function Markdown({ children }: { children: string }) {
  return <InkMarkdown>{children}</InkMarkdown>;
}
