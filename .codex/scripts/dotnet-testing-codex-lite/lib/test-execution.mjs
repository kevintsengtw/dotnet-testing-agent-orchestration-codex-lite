export function classifyTestExecution({ exitCode, counts, coverageAvailable }) {
  const allPassed = Number.isInteger(counts?.total) && counts.total > 0 &&
    counts.failed === 0 && counts.passed === counts.total;
  if (exitCode === 0) {
    return allPassed
      ? { status: "passed", deliveryStatus: "passed", incident: null }
      : { status: "test_failed", deliveryStatus: "failed", incident: null };
  }
  if (Number.isInteger(counts?.failed) && counts.failed > 0) {
    return { status: "test_failed", deliveryStatus: "failed", incident: null };
  }
  if (allPassed && coverageAvailable) {
    return {
      status: "passed_with_runner_incident",
      deliveryStatus: "passed",
      incident: {
        kind: "runner_nonzero_after_complete_evidence",
        exitCode,
        message: "runner returned nonzero after passing tests and complete coverage evidence",
      },
    };
  }
  if (allPassed) {
    return {
      status: "tool_incident",
      deliveryStatus: "passed",
      incident: {
        kind: "runner_nonzero_after_passing_tests",
        exitCode,
        message: "tests passed but the runner process did not provide a reliable successful completion",
      },
    };
  }
  return {
    status: "tool_incident",
    deliveryStatus: "unavailable",
    incident: {
      kind: "runner_nonzero_without_reliable_test_counts",
      exitCode,
      message: "test process failed without reliable evidence of test failures",
    },
  };
}
