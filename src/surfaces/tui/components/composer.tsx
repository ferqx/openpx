import React from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import chalk from "chalk";
import stringWidth from "string-width";
import { getSlashCommandDefinitions, getSlashCommandQuery } from "../commands";
import { CommandSuggestions } from "./command-suggestions";
import { theme } from "../theme";

/** 约束 cursorOffset 始终落在当前文本范围内 */
function clampCursorOffset(value: string, cursorOffset: number): number {
  return Math.max(0, Math.min(cursorOffset, value.length));
}

/** 在光标位置插入文本 */
function insertTextAtCursor(value: string, cursorOffset: number, inserted: string) {
  const nextValue = value.slice(0, cursorOffset) + inserted + value.slice(cursorOffset);
  return {
    value: nextValue,
    cursorOffset: cursorOffset + inserted.length,
  };
}

/** 删除光标前一个字符 */
function deleteBackwardAtCursor(value: string, cursorOffset: number) {
  if (cursorOffset <= 0) {
    return { value, cursorOffset };
  }

  return {
    value: value.slice(0, cursorOffset - 1) + value.slice(cursorOffset),
    cursorOffset: cursorOffset - 1,
  };
}

/** 删除光标后的一个字符 */
function deleteForwardAtCursor(value: string, cursorOffset: number) {
  if (cursorOffset >= value.length) {
    return { value, cursorOffset };
  }

  return {
    value: value.slice(0, cursorOffset) + value.slice(cursorOffset + 1),
    cursorOffset,
  };
}

function resolveCursorLine(value: string, cursorOffset: number) {
  const lines = value.split("\n");
  let remaining = clampCursorOffset(value, cursorOffset);

  for (let index = 0; index < lines.length; index += 1) {
    const lineLength = lines[index]?.length ?? 0;
    if (remaining <= lineLength) {
      return { lineIndex: index, columnIndex: remaining, lines };
    }

    remaining -= lineLength + 1;
  }

  return {
    lineIndex: Math.max(0, lines.length - 1),
    columnIndex: lines.at(-1)?.length ?? 0,
    lines,
  };
}

function buildSingleLineEditor(value: string, cursorOffset: number, width: number) {
  const prompt = chalk.bold.green(theme.symbols.prompt);

  if (value.length === 0) {
    const placeholder = `${prompt} ${chalk.inverse(" ")}${chalk.white("Ask openpx... Press / for commands")}`;
    return chalk.white(placeholder);
  }

  const safeCursor = clampCursorOffset(value, cursorOffset);
  const beforeCursor = value.slice(0, safeCursor);
  const cursorCharacter = value[safeCursor] ?? " ";
  const afterCursor = value.slice(Math.min(safeCursor + (value[safeCursor] ? 1 : 0), value.length));
  const content = `${prompt} ${chalk.white(beforeCursor)}${chalk.inverse(cursorCharacter)}${chalk.white(afterCursor)}`;
  return chalk.white(content);
}

function isBackwardDeleteKey(keyValue: string, key: { backspace?: boolean }) {
  return key.backspace || keyValue === "\u0008" || keyValue === "\u007f";
}

function isForwardDeleteKey(keyValue: string, key: { delete?: boolean }) {
  return key.delete || keyValue === "\u001B[3~";
}

export function Composer(input: { 
  onSubmit?: (text: string) => Promise<void> | void;
  prompt?: string;
  mode?: "input" | "confirm" | "blocked";
  onCommandMenuOpenChange?: (isOpen: boolean) => void;
  onEscape?: () => Promise<void> | void;
  isActive?: boolean;
}) {
  const { stdout } = useStdout();
  const [value, setValue] = useState("");
  const [cursorOffset, setCursorOffset] = useState(0);
  const valueRef = useRef(value);
  const cursorOffsetRef = useRef(cursorOffset);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const selectedSuggestionIndexRef = useRef(0);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const mode = input.mode ?? "input";
  const slashQuery = mode !== "confirm" ? getSlashCommandQuery(value) : null;
  const suggestions =
    slashQuery !== null && !suggestionsDismissed ? getSlashCommandDefinitions(slashQuery) : [];
  const isSuggestionOpen = suggestions.length > 0;
  const modeRef = useRef(mode);
  const suggestionsRef = useRef(suggestions);
  const isSuggestionOpenRef = useRef(isSuggestionOpen);
  const onSubmitRef = useRef(input.onSubmit);
  const onEscapeRef = useRef(input.onEscape);

  useEffect(() => {
    input.onCommandMenuOpenChange?.(isSuggestionOpen);
  }, [input.onCommandMenuOpenChange, isSuggestionOpen]);

  useEffect(() => {
    if (selectedSuggestionIndex >= suggestions.length) {
      setSelectedSuggestionIndex(0);
      selectedSuggestionIndexRef.current = 0;
    }
  }, [selectedSuggestionIndex, suggestions.length]);

  modeRef.current = mode;
  suggestionsRef.current = suggestions;
  isSuggestionOpenRef.current = isSuggestionOpen;
  onSubmitRef.current = input.onSubmit;
  onEscapeRef.current = input.onEscape;
  selectedSuggestionIndexRef.current = selectedSuggestionIndex;

  function updateEditor(nextValue: string, nextCursorOffset: number) {
    valueRef.current = nextValue;
    cursorOffsetRef.current = nextCursorOffset;
    setValue(nextValue);
    setCursorOffset(nextCursorOffset);
  }

  const handleInput = useCallback(async (keyValue: string, key: {
    backspace?: boolean;
    delete?: boolean;
    return?: boolean;
    escape?: boolean;
    leftArrow?: boolean;
    rightArrow?: boolean;
    upArrow?: boolean;
    downArrow?: boolean;
    home?: boolean;
    end?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    tab?: boolean;
  }) => {
    const backwardDelete = isBackwardDeleteKey(keyValue, key);
    const forwardDelete = isForwardDeleteKey(keyValue, key);
    const activeMode = modeRef.current;
    const activeSuggestions = suggestionsRef.current;
    const suggestionMenuOpen = isSuggestionOpenRef.current;

    if (activeMode === "confirm") {
      if (key.return) {
        await onSubmitRef.current?.(valueRef.current.trim() || "yes");
        updateEditor("", 0);
      } else if (key.escape) {
        await onSubmitRef.current?.("no");
        updateEditor("", 0);
      } else if (key.leftArrow) {
        updateEditor(valueRef.current, Math.max(0, cursorOffsetRef.current - 1));
      } else if (key.rightArrow) {
        updateEditor(valueRef.current, Math.min(valueRef.current.length, cursorOffsetRef.current + 1));
      } else if (key.home || (key.ctrl && keyValue.toLowerCase() === "a")) {
        updateEditor(valueRef.current, 0);
      } else if (key.end || (key.ctrl && keyValue.toLowerCase() === "e")) {
        updateEditor(valueRef.current, valueRef.current.length);
      } else if (backwardDelete) {
        const next = deleteBackwardAtCursor(valueRef.current, cursorOffsetRef.current);
        updateEditor(next.value, next.cursorOffset);
      } else if (forwardDelete) {
        const next = deleteBackwardAtCursor(valueRef.current, cursorOffsetRef.current);
        updateEditor(next.value, next.cursorOffset);
      } else if (!(key.ctrl || key.meta || key.tab)) {
        const next = insertTextAtCursor(valueRef.current, cursorOffsetRef.current, keyValue);
        updateEditor(next.value, next.cursorOffset);
      }
      return;
    }

    if (suggestionMenuOpen) {
      if (key.escape) {
        setSuggestionsDismissed(true);
        return;
      }

      if (key.downArrow) {
        setSelectedSuggestionIndex((current) => Math.min(current + 1, activeSuggestions.length - 1));
        return;
      }

      if (key.upArrow) {
        setSelectedSuggestionIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (key.return) {
        const selected = activeSuggestions[selectedSuggestionIndexRef.current] ?? activeSuggestions[0];
        if (!selected) {
          return;
        }

        if (selected.acceptsArgs) {
          updateEditor(`${selected.command} `, `${selected.command} `.length);
          setSuggestionsDismissed(false);
          setSelectedSuggestionIndex(0);
          return;
        }

        await onSubmitRef.current?.(selected.command);
        updateEditor("", 0);
        setSuggestionsDismissed(false);
        setSelectedSuggestionIndex(0);
        return;
      }
    }

    if (keyValue === "\n" || (key.ctrl && keyValue.toLowerCase() === "j")) {
      const next = insertTextAtCursor(valueRef.current, cursorOffsetRef.current, "\n");
      updateEditor(next.value, next.cursorOffset);
      setSuggestionsDismissed(false);
      return;
    }

    if (key.return) {
      if (valueRef.current.trim()) {
        await onSubmitRef.current?.(valueRef.current);
        updateEditor("", 0);
        setSuggestionsDismissed(false);
        setSelectedSuggestionIndex(0);
      }
      return;
    }

    if (key.escape) {
      await onEscapeRef.current?.();
      return;
    }

    if (backwardDelete || forwardDelete) {
      const next = backwardDelete || forwardDelete
        ? deleteBackwardAtCursor(valueRef.current, cursorOffsetRef.current)
        : deleteForwardAtCursor(valueRef.current, cursorOffsetRef.current);
      updateEditor(next.value, next.cursorOffset);
      setSuggestionsDismissed(false);
      return;
    }

    if (key.leftArrow) {
      updateEditor(valueRef.current, Math.max(0, cursorOffsetRef.current - 1));
      return;
    }

    if (key.rightArrow) {
      updateEditor(valueRef.current, Math.min(valueRef.current.length, cursorOffsetRef.current + 1));
      return;
    }

    if (key.home || (key.ctrl && keyValue.toLowerCase() === "a")) {
      updateEditor(valueRef.current, 0);
      return;
    }

    if (key.end || (key.ctrl && keyValue.toLowerCase() === "e")) {
      updateEditor(valueRef.current, valueRef.current.length);
      return;
    }

    if (key.ctrl || key.meta || key.tab) {
      return;
    }

    const next = insertTextAtCursor(valueRef.current, cursorOffsetRef.current, keyValue);
    updateEditor(next.value, next.cursorOffset);
    setSuggestionsDismissed(false);
  }, []);

  useInput(handleInput, { isActive: input.isActive ?? true });

  if (mode === "confirm") {
    return (
      <Box paddingX={0}>
        <Text color={theme.colors.user} bold>{theme.symbols.prompt} Confirm work? </Text>
        {value.length > 0 ? (
          <Text color="yellow">{value}</Text>
        ) : (
          <Text color="yellow">[Y/n]</Text>
        )}
      </Box>
    );
  }

  const { lineIndex: cursorLineIndex, columnIndex: cursorColumnIndex, lines } = resolveCursorLine(value, cursorOffset);
  const prompt = chalk.bold.green(theme.symbols.prompt);
  const promptIndent = " ";
  const isMultiline = value.includes("\n");
  const singleLineWidth = Math.max(0, (stdout?.columns ?? 80) - 6);

  return (
    <Box paddingY={0} flexDirection="column" width="100%;">
      <Box flexDirection="column" width="100%">
        {!isMultiline ? (
          <Box width="100%">
            <Text>{buildSingleLineEditor(value, cursorOffset, singleLineWidth)}</Text>
          </Box>
        ) : (
          lines.map((line, index) => {
            const isCursorLine = index === cursorLineIndex;
            const beforeCursor = isCursorLine ? line.slice(0, cursorColumnIndex) : line;
            const cursorCharacter = isCursorLine ? (line[cursorColumnIndex] ?? " ") : "";
            const afterCursor = isCursorLine
              ? line.slice(Math.min(cursorColumnIndex + (line[cursorColumnIndex] ? 1 : 0), line.length))
              : "";

            return (
              <Box key={`composer-line-${index}`} gap={1}>
                {index === 0 ? (
                  <Text color={theme.colors.user}>{theme.symbols.prompt}</Text>
                ) : (
                  <Text color={theme.colors.composerText}>{promptIndent}</Text>
                )}
                <Text color={theme.colors.composerText}>
                  {beforeCursor}
                  {isCursorLine ? <Text inverse>{cursorCharacter}</Text> : null}
                  {isCursorLine ? afterCursor : ""}
                  {!isCursorLine && line.length === 0 ? " " : ""}
                </Text>
              </Box>
            );
          })
        )}
      </Box>
      {isSuggestionOpen ? (
        <CommandSuggestions suggestions={suggestions} selectedIndex={selectedSuggestionIndex} />
      ) : null}
    </Box>
  );
}
