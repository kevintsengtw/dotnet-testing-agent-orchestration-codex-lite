// Verifier owns the proposed changes; the driver owns the delivery artifact.
export function repairGaps(repair) {
  if (Array.isArray(repair?.gaps)) return repair.gaps;
  return [
    ...(Array.isArray(repair?.coverageGaps) ? repair.coverageGaps : []),
    ...(Array.isArray(repair?.qualityGaps) ? repair.qualityGaps : []),
    ...(repair?.testDeliveryGap ? [repair.testDeliveryGap] : []),
  ];
}

export function repairScope(repair) {
  if (repair.scope) return repair.scope;
  const scopes = [
    repair.coverageGaps?.length ? 'coverage' : null,
    repair.qualityGaps?.length ? 'quality' : null,
    repair.testDeliveryGap ? 'test-delivery' : null,
  ].filter(Boolean);
  return scopes.length === 1 ? scopes[0] : 'mixed';
}

export function repairManifestErrors(repair) {
  const errors = [];
  if (repair?.schemaVersion !== 1) errors.push('repair manifest schemaVersion must be 1');
  for (const field of ['gaps', 'coverageGaps', 'qualityGaps']) {
    if (repair?.[field] !== undefined && !Array.isArray(repair[field])) {
      errors.push(`repair manifest ${field} must be an array when present`);
    }
  }
  if (repair?.scope !== undefined && !['coverage', 'quality', 'test-delivery', 'mixed'].includes(repair.scope)) {
    errors.push('repair manifest scope is invalid');
  }
  if (repair?.gaps !== undefined && (repair.coverageGaps !== undefined ||
      repair.qualityGaps !== undefined || repair.testDeliveryGap !== undefined)) {
    errors.push('repair manifest must use gaps or legacy gap groups, not both');
  }
  const gaps = repairGaps(repair);
  if (gaps.length === 0) errors.push('repair manifest requires at least one finite gap');
  for (const [index, gap] of gaps.entries()) {
    if (!gap || typeof gap !== 'object' || Array.isArray(gap)) {
      errors.push(`repair gap ${index} must be an object`);
      continue;
    }
    for (const field of ['id', 'reason', 'action']) {
      if (typeof gap[field] !== 'string' || !gap[field].trim()) errors.push(`repair gap ${index}.${field} is required`);
    }
  }
  return errors;
}

export function projectRepairManifest(verification, verificationPath) {
  const scopes = [
    verification.build?.status === 'failed' || verification.test?.status === 'failed' ? 'test-delivery' : null,
    verification.goal?.met === false ? 'coverage' : null,
    verification.quality?.status === 'issues' ? 'quality' : null,
  ].filter(Boolean);
  const repair = {
    schemaVersion: 1,
    sourceVerificationPath: verificationPath,
    scope: scopes.length > 1 ? 'mixed' : scopes[0] ?? 'quality',
    gaps: structuredClone(verification.coverageDecision?.repairable ?? []),
  };
  const errors = repairManifestErrors(repair);
  if (errors.length) throw Error(errors.join('; '));
  return repair;
}
