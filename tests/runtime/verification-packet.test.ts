import { describe, expect, test } from "bun:test";
import { verificationPacketSchema } from "../../src/runtime/verification/verification-packet";
import { verificationResultSchema } from "../../src/runtime/verification/verification-result";

describe("verification contracts", () => {
  test("parses a narrow verification packet with evidence and optional diff snippets", () => {
    const parsed = verificationPacketSchema.parse({
      acceptanceCriteria: ["startup message updated"],
      changedFiles: [
        {
          path: "src/app/main.ts",
          summary: "Updated startup banner copy",
        },
      ],
      artifactRefs: ["patch:src/app/main.ts", "test:tests/runtime/intake-normalize.test.ts"],
      buildEvidence: ["bun test tests/runtime/intake-normalize.test.ts"],
      diffSnippets: ["- Welcome\n+ OpenPX is ready"],
    });

    expect(parsed.changedFiles[0]?.path).toBe("src/app/main.ts");
    expect(parsed.buildEvidence).toEqual(["bun test tests/runtime/intake-normalize.test.ts"]);
  });

  test("accepts PASS, FAIL, and PARTIAL verification verdicts", () => {
    const pass = verificationResultSchema.parse({
      verdict: "PASS",
      summary: "All acceptance criteria passed",
    });
    const fail = verificationResultSchema.parse({
      verdict: "FAIL",
      summary: "Startup message did not change",
      failingCriteria: ["startup message updated"],
    });
    const partial = verificationResultSchema.parse({
      verdict: "PARTIAL",
      summary: "Copy updated but test coverage missing",
      nextActions: ["run runtime regression tests"],
    });

    expect(pass.verdict).toBe("PASS");
    expect(fail.verdict).toBe("FAIL");
    expect(partial.verdict).toBe("PARTIAL");
  });
});
