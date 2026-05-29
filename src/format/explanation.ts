import type { ConceptRecord, EvidenceLevel, LearnerPreferences, RankedLearningMoment } from '../types.js';
import type { WhyLead, WhyResponsePlan } from './response-plan.js';
import { rankEvidenceForDisplay, type EvidenceDisplayOptions } from './evidence.js';
import { conceptMetadata } from '../concepts/mapper.js';
import { defaultPreferences } from '../storage/user-store.js';
import { bullet } from './markdown.js';

export function formatLearningMoments(items: ConceptRecord[] | RankedLearningMoment[], evidenceOptions: EvidenceDisplayOptions = {}): string {
  if (items.length === 0) {
    return '# Daily Learning Card\n\n아직 프로젝트 근거를 찾지 못했습니다. `contextbook scan` 후 다시 시도하거나, 코드에 개념 신호가 있는지 확인해 주세요.\n';
  }
  const selected = items.slice(0, 3);
  return `# Daily Learning Card\n\n오늘 코드에서 뽑은 Learning Moments입니다.\n\n${selected.map((item, index) => formatMoment(normalizeMoment(item), index + 1, evidenceOptions)).join('\n\n')}`;
}

function normalizeMoment(item: ConceptRecord | RankedLearningMoment): RankedLearningMoment {
  if ('concept' in item) return item;
  return {
    concept: item,
    score: 0,
    reasons: [{
      code: 'stable-fallback',
      label: '안정적 후보',
      detail: '현재 프로젝트 근거 중 학습 카드에 포함할 수 있는 안정적인 후보입니다.'
    }]
  };
}

function formatMoment(moment: RankedLearningMoment, index: number, evidenceOptions: EvidenceDisplayOptions): string {
  const { concept } = moment;
  const evidence = rankEvidenceForDisplay(concept.signals, evidenceOptions);
  const changed = concept.signals.some((signal) => evidenceOptions.changedFiles?.has(signal.file ?? '') || (!evidenceOptions.changedFiles && signal.changed)) ? '\n변경 파일 근거: yes' : '';
  return `## ${index}. ${concept.label}\n\n근거 수준: ${concept.evidenceLevel}\n근거 파일: ${evidence.visibleFiles.length ? evidence.visibleFiles.join(', ') : '없음'}${changed}\n\n추천 이유:\n${bullet(moment.reasons.map((reason) => `${reason.label}: ${reason.detail}`))}\n\n이 프로젝트에서는 ${evidence.primarySignal?.reason ?? concept.signals[0]?.reason ?? '관련 신호'} 때문에 이 개념을 학습할 수 있습니다.\n\n연결되는 개념:\n${bullet(concept.connectedConcepts)}\n\n면접 질문:\n${concept.interviewQuestion}`;
}

export function formatWhyAnswer(
  question: string,
  concept: ConceptRecord | undefined,
  fallback: ReturnType<typeof conceptMetadata> | undefined,
  preferences: LearnerPreferences = defaultPreferences,
  responsePlan?: WhyResponsePlan
): string {
  const metadata = concept ? conceptMetadata(concept.id) : fallback;
  const label = concept?.label ?? metadata?.label ?? question;
  const evidenceLevel: EvidenceLevel = concept?.evidenceLevel ?? 'general';
  const evidence = concept ? rankEvidenceForDisplay(concept.signals) : undefined;
  const files = evidence?.visibleFiles ?? [];
  const signal = evidence?.primarySignal;
  const projectText = concept
    ? `이 프로젝트에서는 ${signal ? `\`${signal.signal}\` 신호가 보여서` : '관련 신호가 보여서'} \`${label}\`을 코드 맥락으로 설명할 수 있습니다${signal?.file ? ` (${signal.file})` : ''}.`
    : `이 프로젝트에서는 \`${label}\` 근거를 찾지 못했습니다. 그래서 아래 설명은 일반 개념 기준입니다.`;

  const id = metadata?.id ?? concept?.id ?? 'general';
  const explanations: Record<string, string> = {
    project: projectText,
    plain: plainExplanation(id),
    'developer-term': developerExplanation(id, label),
    'cs-link': csExplanation(id),
    'interview-sentence': interviewSentence(id, label)
  };
  const plan = responsePlan ?? fallbackResponsePlan(preferences);
  const atomOrder = responsePlanAtomOrder(plan);
  return formatNarrativeWhyAnswer({ evidenceLevel, files, explanations, atomOrder, responsePlan: plan });
}

function fallbackResponsePlan(preferences: LearnerPreferences): WhyResponsePlan {
  const atomOrder = normalizeLegacyOrder(preferences.explanationOrder);
  const lead = atomOrder[0] === 'interview' ? 'interview' : atomOrder[0] === 'plain' ? 'plain' : 'project';
  return {
    lead,
    density: preferences.outputLength === 'short' ? 'compact' : 'normal',
    emphasis: atomOrder,
    includeInterviewLine: lead !== 'interview',
    evidenceVisibility: preferences.outputLength === 'short' ? 'compact' : 'normal',
    examples: 'none',
    followUp: 'none',
    tone: 'neutral',
    reasons: ['legacy-preference-fallback']
  };
}

function normalizeLegacyOrder(order: string[]): Array<'project' | 'plain' | 'developer' | 'cs' | 'interview'> {
  const canonical: Array<'project' | 'plain' | 'developer' | 'cs' | 'interview'> = ['project', 'plain', 'developer', 'cs', 'interview'];
  const aliases: Record<string, 'project' | 'plain' | 'developer' | 'cs' | 'interview'> = {
    'project-context': 'project',
    project: 'project',
    plain: 'plain',
    developer: 'developer',
    'developer-term': 'developer',
    cs: 'cs',
    'cs-link': 'cs',
    interview: 'interview',
    'interview-sentence': 'interview'
  };
  const seen = new Set<string>();
  return [...order.map((key) => aliases[key]).filter(Boolean), ...canonical].filter((key) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function responsePlanAtomOrder(plan: WhyResponsePlan): Array<'project' | 'plain' | 'developer' | 'cs' | 'interview'> {
  const defaultEmphasis: Array<'project' | 'plain' | 'developer' | 'cs' | 'interview'> = ['project', 'plain', 'developer', 'cs', 'interview'];
  const emphasis = plan.emphasis.length ? plan.emphasis : defaultEmphasis;
  if (plan.lead === 'uncertainty') return emphasis;
  return [plan.lead, ...emphasis.filter((item) => item !== plan.lead)];
}

function plainExplanation(id: string): string {
  switch (id) {
    case 'use-effect-cleanup': return '열어둔 연결, 타이머, 구독은 다 쓰고 나면 닫아야 합니다.';
    case 'sse': return '서버가 계속 보내주는 소식을 한쪽 방향으로 받아보는 연결입니다.';
    case 'websocket': return '브라우저와 서버가 서로 계속 말을 주고받는 통로입니다.';
    case 'zustand-state': return '여러 컴포넌트가 같이 보는 상태 보관함입니다.';
    case 'context-api': return '컴포넌트 트리 아래로 값을 전달하는 공용 통로입니다.';
    case 'graph-dag': return '대상을 점으로, 관계를 선으로 표현해서 흐름이나 의존성을 이해하는 방식입니다.';
    case 'http-async': return '서버에 요청하고, 늦게 오는 결과와 실패를 다루는 일입니다.';
    case 'debounce': return '짧은 시간에 같은 일이 계속 들어오면, 마지막 요청만 잠깐 기다렸다가 처리하는 방식입니다.';
    case 'timer-event-loop': return '나중에 실행할 일을 예약하고 이벤트 루프가 순서대로 처리하게 하는 방식입니다.';
    case 'memoization-render': return '같은 계산이나 함수를 다시 만들지 않도록 기억해 렌더 비용을 줄이는 방식입니다.';
    default: return '이 개념은 코드에서 반복되는 문제를 설명하기 위한 이름입니다.';
  }
}

function developerExplanation(id: string, label: string): string {
  switch (id) {
    case 'use-effect-cleanup': return '`useEffect cleanup`과 component lifecycle';
    case 'sse': return '`EventSource` 기반 SSE와 async event handling';
    case 'websocket': return 'WebSocket connection lifecycle과 realtime bidirectional communication';
    case 'debounce': return 'debounce, input event handling, rate control';
    default: return `\`${label}\``;
  }
}

function csExplanation(id: string): string {
  switch (id) {
    case 'use-effect-cleanup': return 'resource lifecycle 관점입니다. 파일 핸들, 네트워크 소켓, 구독처럼 열었으면 닫아야 하는 자원과 같습니다.';
    case 'sse': return '네트워크 스트림과 이벤트 기반 비동기 처리로 연결됩니다.';
    case 'timer-event-loop': return 'call stack, task queue, event loop의 스케줄링 문제로 연결됩니다.';
    case 'graph-dag': return '그래프 모델링, 의존성, 순서 결정 문제로 연결됩니다.';
    case 'memoization-render': return '캐싱, 참조 동일성, invalidation 문제로 연결됩니다.';
    case 'debounce': return '이벤트가 너무 자주 발생할 때 처리 빈도를 제어하는 scheduling 문제로 볼 수 있습니다.';
    default: return '소프트웨어가 상태, 자원, 시간, 의존성을 관리하는 방식과 연결됩니다.';
  }
}

function interviewSentence(id: string, label: string): string {
  switch (id) {
    case 'use-effect-cleanup': return '컴포넌트 생명주기와 별개로 유지되는 연결이나 구독은 unmount 시 정리하지 않으면 메모리 누수나 stale update가 발생할 수 있어 cleanup에서 해제합니다.';
    case 'sse': return 'SSE는 서버에서 클라이언트로 지속적으로 이벤트를 보내는 단방향 스트림이므로, 화면 생명주기에 맞춰 연결 생성과 종료를 관리해야 합니다.';
    case 'debounce': return 'debounce는 연속 입력을 매번 처리하지 않고 마지막 입력이 잠잠해진 뒤 실행해서 불필요한 요청이나 렌더링을 줄이는 기법입니다.';
    default: return `${label}은 구현 선택을 넘어서 코드가 어떤 자원, 상태, 의존성, 시간 흐름을 관리하는지 설명하는 개념입니다.`;
  }
}

interface NarrativeWhyInput {
  evidenceLevel: EvidenceLevel;
  files: string[];
  explanations: Record<string, string>;
  atomOrder: Array<'project' | 'plain' | 'developer' | 'cs' | 'interview'>;
  responsePlan: WhyResponsePlan;
}

function formatNarrativeWhyAnswer(input: NarrativeWhyInput): string {
  const interview = input.explanations['interview-sentence'];
  const visibleFiles = input.responsePlan.evidenceVisibility === 'compact' ? input.files.slice(0, 1) : input.files;
  const evidenceFiles = visibleFiles.length ? visibleFiles.map((file) => `- ${file}`).join('\n') : '프로젝트 근거 없음';
  const body = orderedBodyLines(input);
  const lines = [
    `근거: ${input.evidenceLevel}${visibleFiles[0] ? ` · ${visibleFiles[0]}` : ''}`,
    '',
    ...body,
    input.responsePlan.examples === 'project-worked-example' ? projectWorkedExample(input.explanations) : undefined,
    followUpLine(input.responsePlan, interview, input.evidenceLevel),
    '',
    '근거 파일:',
    evidenceFiles,
    ''
  ].filter((line): line is string => line !== undefined && line !== '');
  return `${lines.join('\n\n')}\n`;
}

function orderedBodyLines(input: NarrativeWhyInput): string[] {
  const atomText: Record<'project' | 'plain' | 'developer' | 'cs' | 'interview', string> = {
    project: input.responsePlan.lead === 'interview' ? input.explanations.project : leadAwareText('project', input.responsePlan.lead, input.explanations),
    plain: leadAwareText('plain', input.responsePlan.lead, input.explanations),
    developer: `개발자 용어: ${input.explanations['developer-term']}`,
    cs: `CS 연결: ${input.explanations['cs-link']}`,
    interview: input.responsePlan.lead === 'interview'
      ? `면접 답변: ${input.explanations['interview-sentence']}`
      : `면접 문장: ${input.explanations['interview-sentence']}`
  };
  const ordered = input.atomOrder
    .filter((atom) => input.responsePlan.includeInterviewLine || atom !== 'interview' || input.responsePlan.lead === 'interview')
    .map((atom) => atomText[atom]);
  if (input.responsePlan.lead === 'uncertainty') return compactOrNormalLines(input.responsePlan.density, ordered);
  return compactOrNormalLines(input.responsePlan.density, ordered);
}

function compactOrNormalLines(density: WhyResponsePlan['density'], ordered: string[]): string[] {
  if (density !== 'compact') return ordered;
  const [first, second, ...rest] = ordered;
  const developer = rest.find((line) => line.startsWith('개발자 용어:'));
  const cs = rest.find((line) => line.startsWith('CS 연결:'));
  const interview = rest.find((line) => line.startsWith('면접 문장:'));
  return [
    first && second ? `${stripTrailingPeriod(first)} ${second}` : first ?? second,
    developer && cs ? `개발자/CS 연결: ${developer.replace(/^개발자 용어:\s*/, '')} · ${cs.replace(/^CS 연결:\s*/, '')}` : developer ?? cs,
    interview
  ].filter((line): line is string => Boolean(line));
}

function leadAwareText(atom: 'project' | 'plain', lead: WhyLead, explanations: Record<string, string>): string {
  if (lead === 'plain' && atom === 'plain') return explanations.plain;
  if (lead === 'uncertainty' && atom === 'project') return explanations.project;
  return explanations[atom];
}

function projectWorkedExample(explanations: Record<string, string>): string {
  return `핵심 흐름: ${stripTrailingPeriod(explanations.project)} 이 신호를 개발자 용어와 CS 개념으로 넓혀 설명하면 됩니다.`;
}

function followUpLine(plan: WhyResponsePlan, interview: string, evidenceLevel: EvidenceLevel): string | undefined {
  if (plan.followUp === 'self-check') return '확인 질문: 이 코드의 어떤 신호가 이 개념을 보여주나요?';
  if (plan.followUp === 'interview-drill' && evidenceLevel === 'general') return '연습: 이 개념을 쓰는 파일을 찾으면 위 문장을 프로젝트 상황으로 바꿔보세요.';
  if (plan.followUp === 'interview-drill') return '연습: 위 면접 문장에서 리소스/상태 이름을 실제 코드 이름으로 바꿔 말해보세요.';
  return undefined;
}


function stripTrailingPeriod(text: string): string {
  return text.replace(/[.。]\s*$/, '.');
}
