import React from "react";
import { describe, expect, test } from "bun:test";
import { StatusBar } from "../../src/surfaces/tui/components/status-bar";
import { theme } from "../../src/surfaces/tui/theme";

type ReactNodeLike = React.ReactNode;
type TextPropsLike = { children?: ReactNodeLike; color?: string; bold?: boolean };

function collectTextProps(node: ReactNodeLike): Array<Record<string, unknown>> {
  if (node === null || node === undefined || typeof node === "boolean" || typeof node === "string" || typeof node === "number") {
    return [];
  }

  if (Array.isArray(node)) {
    return node.flatMap(collectTextProps);
  }

  if (React.isValidElement(node)) {
    const props = node.props as TextPropsLike;
    if (typeof node.type === "function" && node.type.name === "Text") {
      return [props, ...collectTextProps(props.children)];
    }

    const elementType = node.type as unknown;
    if (typeof node.type === "function") {
      const renderElement = node.type as (props: TextPropsLike) => ReactNodeLike;
      return collectTextProps(renderElement(props));
    }

    if (
      typeof elementType === "object" &&
      elementType !== null &&
      "type" in elementType &&
      typeof elementType.type === "function"
    ) {
      return collectTextProps(elementType.type(props));
    }
    return collectTextProps(props.children);
  }

  return [];
}

describe("StatusBar", () => {
  test("renders the whole line in dim text without bold emphasis", () => {
    const element = (
      <StatusBar
        modelName="DeepSeek-V3.2"
        thinkingLevel="default"
        workspaceRoot="/Users/chenchao/Code/ai/openpx"
        stage="idle"
      />
    );

    const textProps = collectTextProps(element);

    expect(textProps.length).toBeGreaterThan(0);
    expect(textProps.every((props) => props.color === theme.colors.dim)).toBe(true);
    expect(textProps.some((props) => props.bold === true)).toBe(false);
  });
});
