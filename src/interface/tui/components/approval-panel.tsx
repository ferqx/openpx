import React from "react";
import { Box, Text } from "ink";

export type ApprovalSummary = {
  id: string;
  title: string;
  status: string;
};

export function ApprovalPanel(input: { approvals: ApprovalSummary[] }) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>Approvals</Text>
      {input.approvals.length === 0 ? <Text color="gray">No pending approvals</Text> : null}
      {input.approvals.map((approval) => (
        <Text key={approval.id}>
          {approval.title} [{approval.status}]
        </Text>
      ))}
    </Box>
  );
}
