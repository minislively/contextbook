import type { ConceptRecord, EvidenceLevel, LearnerPreferences } from '../types.js';
import { conceptMetadata } from '../concepts/mapper.js';
import { defaultPreferences } from '../storage/user-store.js';
import { bullet } from './markdown.js';

export function formatLearningMoments(concepts: ConceptRecord[]): string {
  if (concepts.length === 0) {
    return '# Daily Learning Card\n\n아직 프로젝트 근거를 찾지 못했습니다. `contextbook scan` 후 다시 시도하거나, 코드에 개념 신호가 있는지 확인해 주세요.\n';
  }
  const selected = concepts.slice(0, 3);
  return `# Daily Learning Card\n\n오늘 코드에서 뽑은 Learning Moments입니다.\n\n${selected.map((concept, index) => formatMoment(concept, index + 1)).join('\n\n')}`;
}

function formatMoment(concept: ConceptRecord, index: number): string {
  const files = [...new Set(concept.signals.map((signal) => signal.file).filter(Boolean))] as string[];
  const changed = concept.signals.some((signal) => signal.changed) ? '\n변경 파일 근거: yes' : '';
  return `## ${index}. ${concept.label}\n\n근거 수준: ${concept.evidenceLevel}\n근거 파일: ${files.length ? files.join(', ') : '없음'}${changed}\n\n이 프로젝트에서는 ${concept.signals[0]?.reason ?? '관련 신호'} 때문에 이 개념을 학습할 수 있습니다.\n\n연결되는 개념:\n${bullet(concept.connectedConcepts)}\n\n면접 질문:\n${concept.interviewQuestion}`;
}

export function formatWhyAnswer(
  question: string,
  concept: ConceptRecord | undefined,
  fallback: ReturnType<typeof conceptMetadata> | undefined,
  preferences: LearnerPreferences = defaultPreferences
): string {
  const metadata = concept ? conceptMetadata(concept.id) : fallback;
  const label = concept?.label ?? metadata?.label ?? question;
  const evidenceLevel: EvidenceLevel = concept?.evidenceLevel ?? 'general';
  const files = concept ? [...new Set(concept.signals.map((signal) => signal.file).filter(Boolean))] as string[] : [];
  const projectText = concept
    ? `현재 프로젝트에서 \`${concept.signals[0]?.signal}\` 신호를 찾았습니다${files[0] ? ` (${files[0]})` : ''}. 그래서 \`${label}\` 개념을 이 코드 기준으로 설명할 수 있습니다.`
    : `현재 프로젝트에서 이 질문에 대한 직접 근거를 찾지 못했습니다. 따라서 일반 개념으로 설명하고, 적용 가능성이 있는 지점은 다음 scan 결과를 기준으로 다시 확인해야 합니다.`;

  const id = metadata?.id ?? concept?.id ?? 'general';
  const sections: Record<string, string> = {
    project: `## 프로젝트 말로 설명\n${projectText}`,
    plain: `## 쉬운 말\n${plainExplanation(id)}`,
    'developer-term': `## 개발자 용어\n${developerExplanation(id, label)}`,
    'cs-link': `## CS 연결\n${csExplanation(id)}`,
    'interview-sentence': `## 면접 문장\n${interviewSentence(id, label)}`
  };
  const order = normalizeOrder(preferences.explanationOrder);
  const orderedSections = order.map((key) => sections[key]).filter(Boolean);

  return `## 근거 수준\n${evidenceLevel}\n\n${orderedSections.join('\n\n')}\n\n## 근거 파일\n${files.length ? files.join('\n') : '프로젝트 근거 없음'}\n`;
}

function normalizeOrder(order: string[]): string[] {
  const canonical = ['project', 'plain', 'developer-term', 'cs-link', 'interview-sentence'];
  const aliases: Record<string, string> = {
    'project-context': 'project',
    developer: 'developer-term',
    cs: 'cs-link',
    interview: 'interview-sentence'
  };
  const seen = new Set<string>();
  const normalized = order.map((key) => aliases[key] ?? key).filter((key) => canonical.includes(key));
  return [...normalized, ...canonical].filter((key) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    case 'timer-event-loop': return '나중에 실행할 일을 예약하고 이벤트 루프가 순서대로 처리하게 하는 방식입니다.';
    case 'memoization-render': return '같은 계산이나 함수를 다시 만들지 않도록 기억해 렌더 비용을 줄이는 방식입니다.';
    default: return '이 개념은 코드에서 반복되는 문제를 설명하기 위한 이름입니다.';
  }
}

function developerExplanation(id: string, label: string): string {
  switch (id) {
    case 'use-effect-cleanup': return '이건 `useEffect cleanup`과 component lifecycle 문제입니다.';
    case 'sse': return '이건 `EventSource` 기반 SSE와 async event handling 문제입니다.';
    case 'websocket': return '이건 WebSocket connection lifecycle과 realtime bidirectional communication 문제입니다.';
    default: return `개발자 용어로는 \`${label}\` 문제입니다.`;
  }
}

function csExplanation(id: string): string {
  switch (id) {
    case 'use-effect-cleanup': return '더 넓게 보면 resource lifecycle 문제입니다. 파일 핸들, 네트워크 소켓, 구독처럼 열었으면 닫아야 하는 자원과 같습니다.';
    case 'sse': return '네트워크 스트림과 이벤트 기반 비동기 처리로 연결됩니다.';
    case 'timer-event-loop': return 'call stack, task queue, event loop의 스케줄링 문제로 연결됩니다.';
    case 'graph-dag': return '그래프 모델링, 의존성, 순서 결정 문제로 연결됩니다.';
    case 'memoization-render': return '캐싱, 참조 동일성, invalidation 문제로 연결됩니다.';
    default: return '더 넓게 보면 소프트웨어가 상태, 자원, 시간, 의존성을 관리하는 방식과 연결됩니다.';
  }
}

function interviewSentence(id: string, label: string): string {
  switch (id) {
    case 'use-effect-cleanup': return '컴포넌트 생명주기와 별개로 유지되는 연결이나 구독은 unmount 시 정리하지 않으면 메모리 누수나 stale update가 발생할 수 있어 cleanup에서 해제합니다.';
    case 'sse': return 'SSE는 서버에서 클라이언트로 지속적으로 이벤트를 보내는 단방향 스트림이므로, 화면 생명주기에 맞춰 연결 생성과 종료를 관리해야 합니다.';
    default: return `${label}은 구현 선택을 넘어서 코드가 어떤 자원, 상태, 의존성, 시간 흐름을 관리하는지 설명하는 개념입니다.`;
  }
}
