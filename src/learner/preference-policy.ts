import type { PreferencePolicyDecision, PreferencePolicyDecisionCode, PreferencePolicyMode, PreferenceSignalCandidate } from '../types.js';

const AUTO_APPLY_ALLOWLIST = new Set([
  'avoid:abstract-lecture-first',
  'explanation.order:project-first',
  'explanation.style:plain-language',
  'output.section:interview-sentence',
  'output.length:short',
  'command.volume:fewer-commands',
  'language:ko',
  'language:en'
]);

export interface PreferencePolicyOptions {
  mode?: PreferencePolicyMode;
}

export function evaluatePreferencePolicy(signal: PreferenceSignalCandidate, options: PreferencePolicyOptions = {}): PreferencePolicyDecision {
  const mode = options.mode ?? 'auto-safe';
  const key = `${signal.dimension}:${signal.value}`;

  if (signal.risk === 'high' || signal.intent === 'unsafe-self-assessment' || signal.scopeEvidence.includes('unsafe-self-assessment')) {
    return decision(signal, mode, 'reject', 'UNSAFE_USER_JUDGMENT', false, 'User ability/self-assessment signals are never written as durable preferences.');
  }

  if (mode === 'manual') {
    return decision(signal, mode, 'suggest', 'MANUAL_MODE', true, 'Manual mode records the candidate but never auto-applies it.');
  }

  if (signal.scope === 'turn-local' || signal.policy === 'observe-only') {
    return decision(signal, mode, 'suggest', 'TURN_LOCAL_OR_OBSERVE_ONLY', true, 'Turn-local or observe-only signals should remain suggestions, not durable preferences.');
  }

  if (signal.policy === 'suggest-only' || signal.policy === 'dry-run-only') {
    return decision(signal, mode, 'suggest', 'AMBIGUOUS_SCOPE', true, 'The signal may be useful, but its durable scope is ambiguous.');
  }

  if (mode === 'suggest') {
    return decision(signal, mode, 'suggest', 'SUGGEST_MODE', true, 'Suggest mode previews safe preferences without mutating memory.');
  }

  if (signal.policy !== 'apply-eligible' || signal.route !== 'auto-apply-safe') {
    return decision(signal, mode, 'suggest', 'NOT_APPLY_ELIGIBLE', true, 'Only apply-eligible auto-apply-safe signals can mutate preferences.');
  }

  if (!AUTO_APPLY_ALLOWLIST.has(key)) {
    return decision(signal, mode, 'suggest', 'NOT_IN_AUTO_APPLY_ALLOWLIST', true, 'The signal is not in the low-risk preference allowlist.');
  }

  if (signal.risk !== 'low') {
    return decision(signal, mode, 'suggest', 'RISK_NOT_LOW', true, 'Only low-risk preferences can be auto-applied.');
  }

  return decision(signal, mode, 'auto_apply', 'LOW_RISK_EXPLICIT_PREFERENCE', true, 'Low-risk explicit style preference; reversible through preference history/undo.');
}

export function evaluatePreferencePolicies(signals: PreferenceSignalCandidate[], options: PreferencePolicyOptions = {}): PreferencePolicyDecision[] {
  return signals.map((signal) => evaluatePreferencePolicy(signal, options));
}

function decision(
  signal: PreferenceSignalCandidate,
  mode: PreferencePolicyMode,
  result: PreferencePolicyDecision['decision'],
  reasonCode: PreferencePolicyDecisionCode,
  reversible: boolean,
  message: string
): PreferencePolicyDecision {
  return {
    decision: result,
    reasonCode,
    message,
    mode,
    dimension: signal.dimension,
    value: signal.value,
    risk: signal.risk,
    policy: signal.policy,
    scope: signal.scope,
    reversible,
    evidence: signal.scopeEvidence
  };
}
