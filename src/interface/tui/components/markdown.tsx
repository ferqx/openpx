import React from "react";
import { Box, Text } from "ink";

type InlineNode =
  | { type: "text"; content: string }
  | { type: "bold"; content: string }
  | { type: "italic"; content: string }
  | { type: "code"; content: string }
  | { type: "link"; text: string; url: string }
  | { type: "strikethrough"; content: string };

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      nodes.push({ type: "code", content: codeMatch[1]! });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const boldItalicMatch = remaining.match(/^\*\*\*(.+?)\*\*\*/);
    if (boldItalicMatch) {
      nodes.push({ type: "bold", content: boldItalicMatch[1]! });
      remaining = remaining.slice(boldItalicMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      nodes.push({ type: "bold", content: boldMatch[1]! });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      nodes.push({ type: "italic", content: italicMatch[1]! });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      nodes.push({ type: "link", text: linkMatch[1]!, url: linkMatch[2]! });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const strikethroughMatch = remaining.match(/^~~(.+?)~~/);
    if (strikethroughMatch) {
      nodes.push({ type: "strikethrough", content: strikethroughMatch[1]! });
      remaining = remaining.slice(strikethroughMatch[0].length);
      continue;
    }

    const nextToken = remaining.match(/[\*`~\[]/);
    if (nextToken && nextToken.index !== undefined && nextToken.index > 0) {
      nodes.push({ type: "text", content: remaining.slice(0, nextToken.index) });
      remaining = remaining.slice(nextToken.index);
    } else if (nextToken && nextToken.index === 0) {
      nodes.push({ type: "text", content: remaining[0]! });
      remaining = remaining.slice(1);
    } else {
      nodes.push({ type: "text", content: remaining });
      break;
    }
  }

  return nodes;
}

function renderInlineNodes(nodes: InlineNode[]): React.ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return <Text key={`t-${i}`}>{node.content}</Text>;
      case "bold":
        return <Text key={`b-${i}`} bold>{node.content}</Text>;
      case "italic":
        return <Text key={`i-${i}`} dimColor>{node.content}</Text>;
      case "code":
        return <Text key={`c-${i}`} color="cyan" backgroundColor="black">{` ${node.content} `}</Text>;
      case "link":
        return <Text key={`l-${i}`} color="blue" underline>{`${node.text} (${node.url})`}</Text>;
      case "strikethrough":
        return <Text key={`s-${i}`} dimColor>{node.content}</Text>;
      default:
        return null;
    }
  });
}

export function Markdown({ children }: { children: string }) {
  const lines = children.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let codeLanguage = "";
  let listItems: { content: string; ordered: boolean; index: number }[] = [];
  let keyCounter = 0;

  function flushList() {
    if (listItems.length === 0) return;
    const isOrdered = listItems[0]?.ordered ?? false;
    elements.push(
      <Box key={`list-${keyCounter++}`} flexDirection="column" marginBottom={1} paddingLeft={2}>
        {listItems.map((item, i) => {
          const prefix = isOrdered ? `${item.index}. ` : "• ";
          return (
            <Text key={`li-${i}`}>
              <Text color="gray">{prefix}</Text>
              {renderInlineNodes(parseInline(item.content))}
            </Text>
          );
        })}
      </Box>,
    );
    listItems = [];
  }

  function flushCodeBlock() {
    if (codeContent.length === 0) return;
    elements.push(
      <Box key={`code-${keyCounter++}`} flexDirection="column" marginBottom={1} paddingLeft={2}>
        {codeLanguage && (
          <Text color="gray" bold>{`[${codeLanguage}]`}</Text>
        )}
        {codeContent.map((line, i) => (
          <Text key={`codeline-${i}`} color="cyan">{`  ${line}`}</Text>
        ))}
      </Box>,
    );
    codeContent = [];
    codeLanguage = "";
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    const fenceMatch = line.match(/^```(\w*)/);
    if (fenceMatch) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
        codeLanguage = fenceMatch[1] || "";
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    if (line.trim() === "") {
      flushList();
      elements.push(<Text key={`blank-${keyCounter++}`}>{"\n"}</Text>);
      continue;
    }

    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      flushList();
      elements.push(<Text key={`hr-${keyCounter++}`} color="gray">{"─".repeat(40)}</Text>);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!;
      elements.push(
        <Box key={`h-${keyCounter++}`} flexDirection="column" marginBottom={1}>
          <Text bold={level <= 2} color={level <= 2 ? "white" : "gray"}>
            {text}
          </Text>
        </Box>,
      );
      continue;
    }

    const blockquoteMatch = line.match(/^>\s?(.*)/);
    if (blockquoteMatch) {
      flushList();
      const text = blockquoteMatch[1];
      elements.push(
        <Box key={`bq-${keyCounter++}`} paddingLeft={2} marginBottom={1}>
          <Text color="gray">{"│ "}{text}</Text>
        </Box>,
      );
      continue;
    }

    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)/);
    if (ulMatch) {
      listItems.push({ content: ulMatch[2]!, ordered: false, index: 0 });
      continue;
    }

    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (olMatch) {
      listItems.push({ content: olMatch[3]!, ordered: true, index: parseInt(olMatch[2]!, 10) });
      continue;
    }

    flushList();
    const inlineNodes = parseInline(line);
    elements.push(
      <Box key={`p-${keyCounter++}`} flexDirection="column" marginBottom={1}>
        <Text>{renderInlineNodes(inlineNodes)}</Text>
      </Box>,
    );
  }

  flushList();
  if (inCodeBlock) flushCodeBlock();

  return <Box flexDirection="column">{elements}</Box>;
}
