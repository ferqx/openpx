import { domainError } from "./errors";

export type Id = string;

export function ensureId(value: string): Id {
  if (!value) {
    throw domainError("id must not be empty");
  }

  return value;
}

export function threadId(value: string): Id {
  return ensureId(value);
}

export function taskId(value: string): Id {
  return ensureId(value);
}

export function workerId(value: string): Id {
  return ensureId(value);
}

export function eventId(value: string): Id {
  return ensureId(value);
}

export function approvalRequestId(value: string): Id {
  return ensureId(value);
}

export function memoryId(value: string): Id {
  return ensureId(value);
}

export function toolCallId(value: string): Id {
  return ensureId(value);
}
