import type { ConceptRecord, EvidenceLevel, LearnerPreferences, LearningMomentReason, RankedLearningMoment } from '../types.js';
import type { WhyLead, WhyResponsePlan } from './response-plan.js';
import { rankEvidenceForDisplay, type EvidenceDisplayOptions } from './evidence.js';
import { conceptMetadata } from '../concepts/mapper.js';
import { defaultPreferences } from '../storage/user-store.js';
import { bullet } from './markdown.js';

export function formatLearningMoments(
  items: ConceptRecord[] | RankedLearningMoment[],
  evidenceOptions: EvidenceDisplayOptions = {},
  preferences: LearnerPreferences = defaultPreferences
): string {
  const copy = learningCardCopy(preferences);
  if (items.length === 0) {
    return `${copy.title}\n\n${copy.empty}\n`;
  }
  const selected = items.slice(0, 3);
  return `${copy.title}\n\n${copy.intro}\n\n${selected.map((item, index) => formatMoment(normalizeMoment(item), index + 1, evidenceOptions, preferences)).join('\n\n')}`;
}

type LearningCardLanguage = 'ko' | 'en';

interface LearningCardCopy {
  language: LearningCardLanguage;
  title: string;
  intro: string;
  empty: string;
  evidenceLevel: string;
  evidenceFiles: string;
  changedEvidence: string;
  whyThisCard: string;
  projectConnection: string;
  whyItMattersNow: string;
  relatedConcepts: string;
  interviewPrompt: string;
  noEvidence: string;
}

function learningCardCopy(preferences: LearnerPreferences): LearningCardCopy {
  const language: LearningCardLanguage = preferences.preferredLanguage === 'en' ? 'en' : 'ko';
  if (language === 'en') {
    return {
      language,
      title: '# Daily Learning Card',
      intro: 'Learning moments from the code you just touched.',
      empty: 'No project evidence found yet. Run `contextbook scan` and try again, or check whether the code contains concept signals.',
      evidenceLevel: 'Evidence level',
      evidenceFiles: 'Evidence files',
      changedEvidence: 'Changed-file evidence',
      whyThisCard: 'Why this card',
      projectConnection: 'Project connection',
      whyItMattersNow: 'Why it matters now',
      relatedConcepts: 'Related concepts',
      interviewPrompt: 'Interview prompt',
      noEvidence: 'none'
    };
  }
  return {
    language,
    title: '# Daily Learning Card',
    intro: '오늘 코드에서 뽑은 Learning Moments입니다.',
    empty: '아직 프로젝트 근거를 찾지 못했습니다. `contextbook scan` 후 다시 시도하거나, 코드에 개념 신호가 있는지 확인해 주세요.',
    evidenceLevel: '근거 수준',
    evidenceFiles: '근거 파일',
    changedEvidence: '변경 파일 근거',
    whyThisCard: '추천 이유',
    projectConnection: '프로젝트 연결',
    whyItMattersNow: '왜 지금 볼 만한가',
    relatedConcepts: '연결되는 개념',
    interviewPrompt: '면접 질문',
    noEvidence: '없음'
  };
}

function renderLearningReason(reason: LearningMomentReason, language: LearningCardLanguage): string {
  if (language === 'en') {
    const copy: Record<LearningMomentReason['code'], string> = {
      'changed-file': 'Changed-file evidence: This concept appears in a recently changed file.',
      'direct-evidence': 'Direct evidence: The project contains direct code signals for this concept.',
      'related-evidence': 'Related evidence: The project has nearby structures or patterns for this concept.',
      'multiple-signals': 'Repeated signals: Multiple signals point to the same concept.',
      'source-variety': 'Source variety: Code, package, naming, or file signals reinforce the same concept.',
      'stable-fallback': 'Stable candidate: This is a safe concept to include from the current project evidence.'
    };
    return copy[reason.code] ?? `${reason.label}: ${reason.detail}`;
  }
  return `${reason.label}: ${reason.detail}`;
}

function renderProjectConnection(concept: ConceptRecord, signal: ConceptRecord['signals'][number] | undefined, language: LearningCardLanguage): string {
  const signalText = signal?.signal ? `\`${signal.signal}\`` : language === 'en' ? 'project signal' : '프로젝트 신호';
  const source = signalSourceLabel(signal?.source, language);
  const conceptFocus = conceptFocusText(concept, language);
  if (language === 'en') {
    return `${source} ${signalText} appears in this codebase, so this is a concrete place to study ${conceptFocus}.`;
  }
  return `${source}: ${signalText}. 이 프로젝트 기준 학습 주제는 ${conceptFocus}입니다.`;
}

function learningMomentValueLine(concept: ConceptRecord, language: LearningCardLanguage): string {
  if (language === 'en') {
    switch (concept.id) {
      case 'use-effect-cleanup': return 'This helps you explain who owns connection, subscription, or timer cleanup when a component disappears.';
      case 'sse': return 'This helps you explain realtime updates as a connection lifecycle, not just an API call.';
      case 'websocket': return 'This helps you discuss bidirectional realtime work in terms of connection ownership and failure handling.';
      case 'zustand-state': return 'This helps you explain source of truth, subscriptions, and why state changes reach multiple screens.';
      case 'context-api': return 'This helps you connect shared values to render propagation and component boundaries.';
      case 'graph-dag': return 'This helps you describe order, dependencies, and why nodes and edges are a modeling choice.';
      case 'http-async': return 'This helps you explain request success, failure, and delayed responses as one lifecycle.';
      case 'timer-event-loop': return 'This helps you connect timers in code to scheduling and event-loop behavior.';
      case 'memoization-render': return 'This helps you explain which render cost is being avoided and what can go stale.';
      case 'debounce': return 'This helps you explain why repeated events should not always trigger repeated work.';
      default: return 'This helps you turn a code signal into a concrete design responsibility you can talk about.';
    }
  }
  switch (concept.id) {
    case 'use-effect-cleanup': return '컴포넌트가 사라질 때 연결·구독·타이머를 누가 정리하는지 설명하는 데 바로 써먹을 수 있습니다.';
    case 'sse': return '실시간 업데이트를 단순 API 호출이 아니라 연결 생명주기 문제로 설명할 수 있습니다.';
    case 'websocket': return '양방향 실시간 통신을 연결 소유권과 실패 처리까지 묶어서 말할 수 있습니다.';
    case 'zustand-state': return '상태의 source of truth와 subscription이 화면 여러 곳에 미치는 영향을 설명할 수 있습니다.';
    case 'context-api': return '공유 값 변경이 render propagation과 컴포넌트 경계에 어떤 영향을 주는지 연결할 수 있습니다.';
    case 'graph-dag': return 'nodes와 edges가 순서·의존성 문제를 모델링한다는 식으로 설명할 수 있습니다.';
    case 'http-async': return '요청 성공뿐 아니라 실패와 늦게 도착한 응답까지 request lifecycle로 말할 수 있습니다.';
    case 'timer-event-loop': return '코드의 타이머를 event loop scheduling 문제와 연결해서 설명할 수 있습니다.';
    case 'memoization-render': return '어떤 렌더 비용을 줄이는지, 무엇이 stale해질 수 있는지 같이 말할 수 있습니다.';
    case 'debounce': return '반복 이벤트를 매번 처리하지 않는 이유를 불필요한 작업 제어 관점으로 설명할 수 있습니다.';
    default: return '코드 신호를 “내가 맡은 설계 책임”으로 바꿔 말하는 데 도움이 됩니다.';
  }
}

function signalSourceLabel(source: ConceptRecord['signals'][number]['source'] | undefined, language: LearningCardLanguage): string {
  if (language === 'en') {
    switch (source) {
      case 'content': return 'Code usage signal';
      case 'package': return 'Package/dependency signal';
      case 'file-name': return 'File naming signal';
      case 'function-name': return 'Function or hook naming signal';
      default: return 'Project signal';
    }
  }
  switch (source) {
    case 'content': return '코드 사용 신호';
    case 'package': return '패키지 의존성 신호';
    case 'file-name': return '파일 이름 신호';
    case 'function-name': return '함수/훅 이름 신호';
    default: return '프로젝트 신호';
  }
}

function conceptFocusText(concept: ConceptRecord, language: LearningCardLanguage): string {
  switch (concept.id) {
    case 'use-effect-cleanup': return language === 'en' ? 'resource lifecycle and cleanup responsibility' : 'resource lifecycle과 cleanup 책임';
    case 'sse': return language === 'en' ? 'SSE and asynchronous event handling' : 'SSE와 비동기 이벤트 처리';
    case 'websocket': return language === 'en' ? 'realtime bidirectional communication' : '실시간 양방향 통신';
    case 'zustand-state': return language === 'en' ? 'state management and subscriptions' : '상태 관리와 subscription';
    case 'context-api': return language === 'en' ? 'Context API and render propagation' : 'Context API와 render propagation';
    case 'graph-dag': return language === 'en' ? 'graph modeling and dependency structure' : 'graph 모델링과 의존성 구조';
    case 'http-async': return language === 'en' ? 'HTTP request lifecycle and async error handling' : 'HTTP request lifecycle과 async error handling';
    case 'timer-event-loop': return language === 'en' ? 'timers and event-loop scheduling' : 'timer와 event loop scheduling';
    case 'memoization-render': return language === 'en' ? 'memoization and render optimization' : 'memoization과 render optimization';
    case 'debounce': return language === 'en' ? 'event rate control and debounce' : 'event rate control과 debounce';
    default: return concept.label;
  }
}


function interviewPromptText(concept: ConceptRecord, language: LearningCardLanguage): string {
  if (language !== 'en') return concept.interviewQuestion;
  switch (concept.id) {
    case 'use-effect-cleanup': return 'When does a React useEffect need a cleanup function?';
    case 'sse': return 'Why does an SSE connection need lifecycle management in a UI?';
    case 'websocket': return 'How would you explain WebSocket connection lifecycle and cleanup?';
    case 'zustand-state': return 'How does an external state store coordinate subscriptions across components?';
    case 'context-api': return 'How can Context API value changes affect render propagation?';
    case 'graph-dag': return 'What problem is modeled as nodes and edges in this codebase?';
    case 'http-async': return 'How should HTTP request lifecycle and async errors be explained from this code?';
    case 'timer-event-loop': return 'How do timers relate to event-loop scheduling?';
    case 'memoization-render': return 'What rendering cost does memoization reduce here?';
    case 'debounce': return 'How does debounce reduce unnecessary repeated work?';
    default: return concept.interviewQuestion;
  }
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

function formatMoment(moment: RankedLearningMoment, index: number, evidenceOptions: EvidenceDisplayOptions, preferences: LearnerPreferences): string {
  const { concept } = moment;
  const evidence = rankEvidenceForDisplay(concept.signals, evidenceOptions);
  const copy = learningCardCopy(preferences);
  const changed = concept.signals.some((signal) => evidenceOptions.changedFiles?.has(signal.file ?? '') || (!evidenceOptions.changedFiles && signal.changed)) ? `\n${copy.changedEvidence}: yes` : '';
  const reasonLines = moment.reasons.map((reason) => renderLearningReason(reason, copy.language));
  const compact = preferences.outputLength === 'short';
  const sections = [
    `## ${index}. ${concept.label}`,
    `${copy.evidenceLevel}: ${concept.evidenceLevel}\n${copy.evidenceFiles}: ${evidence.visibleFiles.length ? evidence.visibleFiles.join(', ') : copy.noEvidence}${changed}`,
    `${copy.whyThisCard}:\n${bullet(compact ? reasonLines.slice(0, 2) : reasonLines)}`,
    `${copy.projectConnection}:\n${renderProjectConnection(concept, evidence.primarySignal, copy.language)}`,
    `${copy.whyItMattersNow}:\n${learningMomentValueLine(concept, copy.language)}`,
    compact ? undefined : `${copy.relatedConcepts}:\n${bullet(concept.connectedConcepts)}`,
    `${copy.interviewPrompt}:\n${interviewPromptText(concept, copy.language)}`
  ].filter((section): section is string => Boolean(section));
  return sections.join('\n\n');
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
  const input = { conceptId: id, evidenceLevel, files, explanations, atomOrder, responsePlan: plan };
  switch (plan.renderMode) {
    case 'plain': return formatPlainWhyAnswer(input);
    case 'interview': return formatInterviewWhyAnswer(input);
    case 'structured': return formatStructuredWhyAnswer(input);
    case 'uncertainty': return formatUncertaintyWhyAnswer(input);
    default: return formatNarrativeWhyAnswer(input);
  }
}

function fallbackResponsePlan(preferences: LearnerPreferences): WhyResponsePlan {
  const atomOrder = normalizeLegacyOrder(preferences.explanationOrder);
  const lead = atomOrder[0] === 'interview' ? 'interview' : atomOrder[0] === 'plain' ? 'plain' : 'project';
  return {
    renderMode: lead === 'interview' ? 'interview' : lead === 'plain' ? 'plain' : 'narrative',
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
  conceptId: string;
  evidenceLevel: EvidenceLevel;
  files: string[];
  explanations: Record<string, string>;
  atomOrder: Array<'project' | 'plain' | 'developer' | 'cs' | 'interview'>;
  responsePlan: WhyResponsePlan;
}

function formatNarrativeWhyAnswer(input: NarrativeWhyInput): string {
  const visibleFiles = visibleEvidenceFiles(input);
  const interview = input.explanations['interview-sentence'];
  const lines = [
    evidenceLine(input, visibleFiles),
    ...semanticNarrativeLines(input),
    practicalTensionLine(input.conceptId, input.evidenceLevel),
    input.responsePlan.examples === 'project-worked-example' ? projectWorkedExample(input.explanations) : undefined,
    followUpLine(input.responsePlan, interview, input.evidenceLevel),
    '근거 파일:',
    evidenceFileLines(visibleFiles)
  ];
  return renderLines(lines);
}

function formatPlainWhyAnswer(input: NarrativeWhyInput): string {
  const visibleFiles = visibleEvidenceFiles(input);
  const interview = input.explanations['interview-sentence'];
  const lines = [
    evidenceLine(input, visibleFiles),
    ...semanticPlainLines(input),
    practicalTensionLine(input.conceptId, input.evidenceLevel),
    input.responsePlan.examples === 'project-worked-example' ? projectWorkedExample(input.explanations) : undefined,
    followUpLine(input.responsePlan, interview, input.evidenceLevel),
    '근거 파일:',
    evidenceFileLines(visibleFiles)
  ];
  return renderLines(lines);
}

function formatInterviewWhyAnswer(input: NarrativeWhyInput): string {
  const visibleFiles = visibleEvidenceFiles(input);
  const interview = input.explanations['interview-sentence'];
  const lines = [
    evidenceLine(input, visibleFiles),
    interviewShellLine(interview),
    ...semanticNarrativeLines({ ...input, atomOrder: input.atomOrder.filter((atom) => atom !== 'interview') }),
    practicalTensionLine(input.conceptId, input.evidenceLevel),
    input.responsePlan.examples === 'project-worked-example' ? projectWorkedExample(input.explanations) : undefined,
    followUpLine(input.responsePlan, interview, input.evidenceLevel),
    '근거 파일:',
    evidenceFileLines(visibleFiles)
  ];
  return renderLines(lines);
}

function formatStructuredWhyAnswer(input: NarrativeWhyInput): string {
  const visibleFiles = visibleEvidenceFiles(input);
  const interview = input.explanations['interview-sentence'];
  const lines = [
    evidenceLine(input, visibleFiles),
    ...semanticStructuredLines(input),
    practicalTensionLine(input.conceptId, input.evidenceLevel),
    input.responsePlan.examples === 'project-worked-example' ? `프로젝트 예시:\n${projectWorkedExample(input.explanations)}` : undefined,
    followUpLine(input.responsePlan, interview, input.evidenceLevel),
    '근거 파일:',
    evidenceFileLines(visibleFiles)
  ];
  return renderLines(lines);
}

function formatUncertaintyWhyAnswer(input: NarrativeWhyInput): string {
  const visibleFiles = visibleEvidenceFiles(input);
  const interview = input.explanations['interview-sentence'];
  const lines = [
    evidenceLine(input, visibleFiles),
    ...semanticUncertaintyLines(input),
    practicalTensionLine(input.conceptId, input.evidenceLevel),
    input.responsePlan.followUp === 'interview-drill' ? `면접에서는 일반론으로 이렇게 말할 수 있습니다:\n${interview}` : undefined,
    followUpLine(input.responsePlan, interview, input.evidenceLevel),
    '근거 파일:',
    evidenceFileLines(visibleFiles)
  ];
  return renderLines(lines);
}

type WhyAtom = 'project' | 'plain' | 'developer' | 'cs' | 'interview';
interface SemanticEntry { atom: WhyAtom; text: string; }

function semanticEntries(input: NarrativeWhyInput): SemanticEntry[] {
  const atomText: Record<WhyAtom, string> = {
    project: input.explanations.project,
    plain: input.explanations.plain,
    developer: input.explanations['developer-term'],
    cs: input.explanations['cs-link'],
    interview: input.explanations['interview-sentence']
  };
  return input.atomOrder
    .filter((atom) => input.responsePlan.includeInterviewLine || atom !== 'interview' || input.responsePlan.lead === 'interview')
    .map((atom) => ({ atom, text: atomText[atom] }));
}

function semanticNarrativeLines(input: NarrativeWhyInput): string[] {
  const lines = semanticEntries(input).map(narrativeEntryLine);
  return compactSemanticLines(input.responsePlan.density, lines);
}

function semanticPlainLines(input: NarrativeWhyInput): string[] {
  const lines = semanticEntries(input).map((entry) => {
    if (entry.atom === 'plain') return `쉽게 말하면, ${entry.text}`;
    if (entry.atom === 'project') return entry.text;
    if (entry.atom === 'developer') return `개발자 말로는 ${entry.text}`;
    if (entry.atom === 'cs') return `CS로 연결하면 ${entry.text}`;
    return `면접에서는 이렇게 말하면 됩니다:\n${entry.text}`;
  });
  return compactSemanticLines(input.responsePlan.density, lines);
}

function semanticStructuredLines(input: NarrativeWhyInput): string[] {
  const lines = semanticEntries(input).map((entry) => `${structuredLabel(entry.atom)}:\n${entry.text}`);
  return compactSemanticLines(input.responsePlan.density, lines);
}

function semanticUncertaintyLines(input: NarrativeWhyInput): string[] {
  const lines = semanticEntries(input).filter((entry) => entry.atom !== 'interview').map((entry) => {
    if (entry.atom === 'project') return entry.text;
    if (entry.atom === 'plain') return `일반 개념으로는 ${entry.text}`;
    if (entry.atom === 'developer') return `개발자 용어로는 ${entry.text}`;
    if (entry.atom === 'cs') return `CS로는 ${entry.text}`;
    return `면접 일반론:\n${entry.text}`;
  });
  return compactSemanticLines(input.responsePlan.density, lines);
}

function narrativeEntryLine(entry: SemanticEntry): string {
  switch (entry.atom) {
    case 'plain': return `핵심은 ${quoteCore(entry.text)}는 점입니다.`;
    case 'project': return entry.text;
    case 'developer': return `개발자 말로는 ${entry.text}입니다.`;
    case 'cs': return `CS로 넓히면 ${lowerFirst(entry.text)}`;
    case 'interview': return interviewShellLine(entry.text);
  }
}

function interviewShellLine(interview: string): string {
  return `면접에서는 이렇게 말하면 됩니다:\n${interview}`;
}

function structuredLabel(atom: WhyAtom): string {
  switch (atom) {
    case 'plain': return '핵심';
    case 'project': return '프로젝트 연결';
    case 'developer': return '개발자 용어';
    case 'cs': return 'CS 연결';
    case 'interview': return '면접 문장';
  }
}

function compactSemanticLines(density: WhyResponsePlan['density'], lines: string[]): string[] {
  if (density !== 'compact') return lines;
  const [first, second, ...rest] = lines;
  const compacted = first && second ? [`${stripTrailingPeriod(first)} ${second}`] : [first ?? second].filter(Boolean) as string[];
  if (rest.length > 0) compacted.push(rest.join('\n'));
  return compacted;
}

function visibleEvidenceFiles(input: NarrativeWhyInput): string[] {
  return input.responsePlan.evidenceVisibility === 'compact' ? input.files.slice(0, 1) : input.files;
}

function evidenceLine(input: NarrativeWhyInput, visibleFiles: string[]): string {
  return `근거: ${input.evidenceLevel}${visibleFiles[0] ? ` · ${visibleFiles[0]}` : ''}`;
}

function evidenceFileLines(visibleFiles: string[]): string {
  return visibleFiles.length ? visibleFiles.map((file) => `- ${file}`).join('\n') : '프로젝트 근거 없음';
}

function renderLines(lines: Array<string | undefined>): string {
  return `${lines.filter((line): line is string => Boolean(line?.trim())).join('\n\n')}\n`;
}

function quoteCore(text: string): string {
  return `“${stripTrailingPeriod(text).replace(/[.]$/, '')}”`;
}

function lowerFirst(text: string): string {
  return text.replace(/^더 넓게 보면\s*/, '');
}

function projectWorkedExample(explanations: Record<string, string>): string {
  return `핵심 흐름: ${stripTrailingPeriod(explanations.project)} 이 신호를 개발자 용어와 CS 개념으로 넓혀 설명하면 됩니다.`;
}

function practicalTensionLine(id: string, evidenceLevel: EvidenceLevel): string {
  const prefix = evidenceLevel === 'general' ? '실무에서 터지는 지점: 이 프로젝트에서는 직접 근거가 없지만, ' : '실무에서 터지는 지점: ';
  switch (id) {
    case 'use-effect-cleanup': return `${prefix}컴포넌트는 사라졌는데 연결·구독·타이머가 남아 있으면 stale update나 누수가 생깁니다.`;
    case 'sse': return `${prefix}화면이 바뀐 뒤에도 이벤트 스트림이 살아 있으면 같은 업데이트가 중복되거나 오래된 화면을 건드릴 수 있습니다.`;
    case 'websocket': return `${prefix}연결을 누가 열고 닫는지 애매하면 재연결, 중복 메시지, stale listener 문제가 생깁니다.`;
    case 'zustand-state': return `${prefix}source of truth가 흔들리면 여러 컴포넌트가 서로 다른 상태를 보고 있다고 착각하기 쉽습니다.`;
    case 'context-api': return `${prefix}공유 값이 바뀔 때 어떤 하위 컴포넌트까지 다시 렌더되는지 놓치면 성능 문제를 찾기 어렵습니다.`;
    case 'graph-dag': return `${prefix}의존성 방향이나 순서를 잘못 잡으면 실행 순서, 순환, 누락 문제를 설명하기 어려워집니다.`;
    case 'http-async': return `${prefix}요청 실패나 늦은 응답을 같은 lifecycle로 보지 않으면 에러 처리와 stale data가 따로 놀기 쉽습니다.`;
    case 'timer-event-loop': return `${prefix}예약된 작업이 언제 실행되는지 착각하면 race condition이나 불필요한 반복 실행을 만들 수 있습니다.`;
    case 'memoization-render': return `${prefix}무엇을 기억하고 언제 버릴지 애매하면 최적화가 stale value나 불필요한 렌더로 바뀔 수 있습니다.`;
    case 'debounce': return `${prefix}반복 입력을 그대로 처리하면 요청·렌더·계산이 불필요하게 폭증할 수 있습니다.`;
    default: return `${prefix}이 개념을 놓치면 코드가 관리하는 자원, 상태, 시간, 의존성의 책임 경계가 흐려집니다.`;
  }
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
