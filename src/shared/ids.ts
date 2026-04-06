import { ulid } from "ulid";
import { domainError } from "./errors";

export type Id = string;

export function ensureId(value: string): Id {
  if (!value) {
    throw domainError("id must not be empty");
  }

  return value;
}

export function nextId(): Id {
  return ulid();
}

export function threadId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}

export function taskId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}

export function workerId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}

export function eventId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}

export function approvalRequestId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}

export function memoryId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}

export function toolCallId(value?: string): Id {
  return value ? ensureId(value) : nextId();
}
