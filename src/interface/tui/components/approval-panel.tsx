import React from "react";
import { Box, Text } from "ink";
import type { RuntimeSessionState } from "../../runtime/runtime-session";

export type ApprovalSummary = RuntimeSessionState["approvals"][number];

export function ApprovalPanel(input: { approvals: ApprovalSummary[] }) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>Approvals</Text>
      {input.approvals.length === 0 ? <Text color="gray">No pending approvals</Text> : null}
      {input.approvals.map((approval) => (
        <Text key={approval.approvalRequestId}>
          {approval.summary} [{approval.status}]
        </Text>
      ))}
    </Box>
  );
}
