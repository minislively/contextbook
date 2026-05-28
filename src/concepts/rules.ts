import type { EvidenceLevel } from '../types.js';

export interface ConceptRule {
  id: string;
  label: string;
  aliases: string[];
  connectedConcepts: string[];
  interviewQuestion: string;
  evidenceLevel: EvidenceLevel;
  reason: string;
  match(content: string, file: string): { signal: string; line?: number }[];
}

function lineOf(content: string, needle: RegExp): number | undefined {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((line) => needle.test(line));
  return index >= 0 ? index + 1 : undefined;
}

function includesRule(pattern: RegExp, signal: string): (content: string) => { signal: string; line?: number }[] {
  return (content) => pattern.test(content) ? [{ signal, line: lineOf(content, pattern) }] : [];
}

export const conceptRules: ConceptRule[] = [
  {
    id: 'sse',
    label: 'SSE / async event handling',
    aliases: ['sse', 'eventsource', 'event source', 'server sent events', '서버센트', '이벤트소스'],
    connectedConcepts: ['async event handling', 'resource lifecycle', 'network connection'],
    interviewQuestion: 'React에서 SSE 연결을 사용할 때 cleanup이 필요한 이유는 무엇인가요?',
    evidenceLevel: 'direct',
    reason: 'EventSource usage creates a long-lived server-sent event connection.',
    match: includesRule(/\bEventSource\b/, 'EventSource')
  },
  {
    id: 'use-effect-cleanup',
    label: 'useEffect cleanup / lifecycle',
    aliases: ['cleanup', 'useeffect cleanup', 'use effect cleanup', '클린업', '정리', 'lifecycle'],
    connectedConcepts: ['resource lifecycle', 'memory leak', 'stale update'],
    interviewQuestion: 'useEffect에서 cleanup 함수가 필요한 상황은 언제인가요?',
    evidenceLevel: 'direct',
    reason: 'useEffect contains a returned cleanup function.',
    match(content) {
      return /\buseEffect\s*\(/s.test(content) && /return\s*\(?(?:\s*\(.*?\)\s*=>|\s*function|\s*\{)/s.test(content)
        ? [{ signal: 'useEffect + return cleanup', line: lineOf(content, /\buseEffect\s*\(/) }]
        : [];
    }
  },
  {
    id: 'websocket',
    label: 'WebSocket / realtime bidirectional communication',
    aliases: ['websocket', 'web socket', '웹소켓', 'realtime'],
    connectedConcepts: ['realtime communication', 'connection lifecycle', 'bidirectional protocol'],
    interviewQuestion: 'WebSocket과 SSE는 실시간 통신에서 어떤 차이가 있나요?',
    evidenceLevel: 'direct',
    reason: 'WebSocket usage indicates bidirectional realtime communication.',
    match: includesRule(/\bWebSocket\b/, 'WebSocket')
  },
  {
    id: 'zustand-state',
    label: 'Zustand / state management subscription',
    aliases: ['zustand', 'state management', '상태관리', 'subscription'],
    connectedConcepts: ['state management', 'subscription', 'source of truth'],
    interviewQuestion: 'Zustand 같은 store는 React state와 어떤 문제를 다르게 해결하나요?',
    evidenceLevel: 'direct',
    reason: 'Zustand import or usage indicates external state store usage.',
    match: includesRule(/zustand/i, 'zustand')
  },
  {
    id: 'context-api',
    label: 'Context API / render propagation',
    aliases: ['context api', 'createcontext', 'context', '컨텍스트'],
    connectedConcepts: ['provider boundary', 'render propagation', 'shared state'],
    interviewQuestion: 'Context API를 사용할 때 re-render 전파를 주의해야 하는 이유는 무엇인가요?',
    evidenceLevel: 'direct',
    reason: 'createContext usage indicates React Context API.',
    match: includesRule(/\bcreateContext\b/, 'createContext')
  },
  {
    id: 'graph-dag',
    label: 'Graph / DAG / dependency structure',
    aliases: ['graph', 'dag', 'nodes', 'edges', '그래프', '의존성'],
    connectedConcepts: ['nodes and edges', 'dependency graph', 'topological reasoning'],
    interviewQuestion: 'nodes와 edges 구조는 어떤 문제를 graph로 모델링한다는 뜻인가요?',
    evidenceLevel: 'related',
    reason: 'nodes and edges naming suggests graph-like data modeling.',
    match(content) {
      return /\bnodes\b/i.test(content) && /\bedges\b/i.test(content)
        ? [{ signal: 'nodes + edges', line: lineOf(content, /\bnodes\b/i) }]
        : [];
    }
  },
  {
    id: 'http-async',
    label: 'HTTP / async / error handling',
    aliases: ['fetch', 'axios', 'http', 'async', '비동기'],
    connectedConcepts: ['request lifecycle', 'error handling', 'async control flow'],
    interviewQuestion: 'HTTP 요청 코드에서 async/error handling을 어떻게 설명할 수 있나요?',
    evidenceLevel: 'direct',
    reason: 'fetch or axios usage indicates HTTP async work.',
    match: includesRule(/\b(fetch|axios)\b/, 'fetch/axios')
  },
  {
    id: 'debounce',
    label: 'Debounce / event rate control',
    aliases: ['debounce', '디바운스'],
    connectedConcepts: ['event rate control', 'input handling', 'performance'],
    interviewQuestion: 'debounce는 어떤 상황에서 필요하고 throttle과 어떻게 다른가요?',
    evidenceLevel: 'general',
    reason: 'Debounce is explained only when the user asks about it; no project scan rule is attached in v0.1.',
    match() {
      return [];
    }
  },
  {
    id: 'timer-event-loop',
    label: 'Timer / event loop',
    aliases: ['settimeout', 'timer', 'event loop', '이벤트 루프', '타이머'],
    connectedConcepts: ['event loop', 'task queue', 'scheduling'],
    interviewQuestion: 'setTimeout은 이벤트 루프 관점에서 어떻게 실행되나요?',
    evidenceLevel: 'direct',
    reason: 'setTimeout usage indicates timer scheduling through the event loop.',
    match: includesRule(/\bsetTimeout\b/, 'setTimeout')
  },
  {
    id: 'memoization-render',
    label: 'Memoization / render optimization',
    aliases: ['usememo', 'usecallback', 'memoization', '메모이제이션', '렌더 최적화'],
    connectedConcepts: ['referential equality', 'render optimization', 'cache invalidation'],
    interviewQuestion: 'useMemo/useCallback은 어떤 렌더링 비용을 줄이기 위한 도구인가요?',
    evidenceLevel: 'direct',
    reason: 'useMemo/useCallback usage indicates memoization or render optimization.',
    match: includesRule(/\b(useMemo|useCallback)\b/, 'useMemo/useCallback')
  }
];
