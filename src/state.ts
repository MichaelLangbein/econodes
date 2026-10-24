import {
  buildGoodsMarketModel,
  calculateMarketEquilibrium,
  downloadJson,
  getNodeById,
  isEdge,
  isNode,
  type Edge,
  type Graph,
  type MarketParameters,
  type Node,
} from './model';
import { applyForceLayout, renderApp, type ForceLayoutParameters } from './render';

export type Event =
  | { type: 'init' }
  | { type: 'selectNode'; node?: Node }
  | { type: 'moveNode'; node: Node }
  | { type: 'beginNodeMove' }
  | { type: 'endNodeMove'; node: Node }
  | { type: 'renameNode'; node: Node }
  | {
      type: 'updateMarketConfig';
      node: Node;
      parameter: keyof MarketParameters;
      value: number;
    }
  | { type: 'incrementNode'; node: Node }
  | { type: 'decrementNode'; node: Node }
  | { type: 'deleteNode'; node: Node }
  | { type: 'createNode'; node: Node }
  | { type: 'pushImpulsesDownstream' }
  | { type: 'removeImpulses' }
  | { type: 'undo' }
  | { type: 'selectEdge'; edge?: Edge }
  | { type: 'updateEdge'; edge: Edge }
  | { type: 'deleteEdge'; edge: Edge }
  | { type: 'createEdge'; edge: Edge }
  | { type: 'distributeNodes'; parameters: ForceLayoutParameters }
  | { type: 'exportGraph' };

export interface Impulse {
  nodeId: number;
  delta: number;
}

export interface ImpulseVisualHistoryEntry {
  nodeIds: number[];
  edgeIds: number[];
}

export interface LogEntry {
  message: string;
  age: number;
}

export interface AppStateSnapshot {
  data: Graph;
  selected?: Node | Edge;
  impulses: Impulse[];
  logs: LogEntry[];
  recentLogStart: number;
}

export interface ScenarioNodePattern {
  key: string;
  label: string;
  kind?: Node['kind'];
}

export interface ScenarioEdgePattern {
  source: string;
  target: string;
  type?: Edge['type'];
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  nodes: ScenarioNodePattern[];
  edges: ScenarioEdgePattern[];
}

export type HistoryAction = Exclude<
  Event,
  | { type: 'beginNodeMove' }
  | { type: 'endNodeMove' }
  | { type: 'exportGraph' }
  | { type: 'init' }
  | { type: 'selectEdge' }
  | { type: 'selectNode' }
  | { type: 'undo' }
>;

export interface AppHistoryEntry {
  snapshot: AppStateSnapshot;
  action: HistoryAction;
}

export interface AppState extends AppStateSnapshot {
  history: AppHistoryEntry[];
}

export const scenarios: Scenario[] = [
  {
    id: 'illustrative-cascade',
    name: 'Illustrative: three-step cascade',
    description: 'A source affects an intermediate node, which then affects an outcome.',
    nodes: [
      { key: 'source', label: 'Scenario source' },
      { key: 'intermediate', label: 'Scenario intermediate' },
      { key: 'outcome', label: 'Scenario outcome' },
    ],
    edges: [
      { source: 'source', target: 'intermediate' },
      { source: 'intermediate', target: 'outcome' },
    ],
  },
];

const initialData = buildGoodsMarketModel();

export const appState: AppState = {
  data: initialData,
  selected: undefined,
  impulses: [],
  logs: [],
  recentLogStart: 0,
  history: [],
};

let pendingNodeMoveSnapshot: AppStateSnapshot | undefined;

function cloneNode(node: Node): Node {
  return {
    ...node,
    ...(node.market ? { market: { ...node.market } } : {}),
  };
}

function cloneSnapshot(snapshot: AppStateSnapshot): AppStateSnapshot {
  const data: Graph = {
    nodes: snapshot.data.nodes.map(cloneNode),
    edges: snapshot.data.edges.map((edge) => ({ ...edge })),
  };
  let selected: Node | Edge | undefined;
  const selectedElement = snapshot.selected;
  if (selectedElement && isNode(selectedElement)) {
    selected = data.nodes.find((node) => node.id === selectedElement.id);
  } else if (selectedElement && isEdge(selectedElement)) {
    selected = { ...selectedElement };
  }

  return {
    data,
    selected,
    impulses: snapshot.impulses.map((impulse) => ({ ...impulse })),
    logs: snapshot.logs.map((log) => ({ ...log })),
    recentLogStart: snapshot.recentLogStart,
  };
}

function cloneHistoryAction(action: HistoryAction): HistoryAction {
  if ('node' in action) {
    return { ...action, node: cloneNode(action.node) };
  }
  if ('edge' in action) {
    return { ...action, edge: { ...action.edge } };
  }
  if (action.type === 'distributeNodes') {
    return { ...action, parameters: { ...action.parameters } };
  }
  return { ...action };
}

function isUndoableEvent(event: Event): event is HistoryAction {
  return (
    event.type === 'renameNode' ||
    event.type === 'updateMarketConfig' ||
    event.type === 'incrementNode' ||
    event.type === 'decrementNode' ||
    event.type === 'deleteNode' ||
    event.type === 'createNode' ||
    event.type === 'pushImpulsesDownstream' ||
    event.type === 'removeImpulses' ||
    event.type === 'updateEdge' ||
    event.type === 'deleteEdge' ||
    event.type === 'createEdge' ||
    event.type === 'distributeNodes'
  );
}

export function scenarioMatchesGraph(graph: Graph, scenario: Scenario): boolean {
  const matchedNodes = new Map<string, Node>();
  const usedNodeIds = new Set<number>();
  for (const pattern of scenario.nodes) {
    const node = graph.nodes.find(
      (candidate) =>
        candidate.label === pattern.label &&
        (pattern.kind === undefined || candidate.kind === pattern.kind) &&
        !usedNodeIds.has(candidate.id),
    );
    if (!node) return false;
    matchedNodes.set(pattern.key, node);
    usedNodeIds.add(node.id);
  }

  return scenario.edges.every((pattern) => {
    const source = matchedNodes.get(pattern.source);
    const target = matchedNodes.get(pattern.target);
    return (
      source !== undefined &&
      target !== undefined &&
      graph.edges.some(
        (edge) =>
          edge.source === source.id &&
          edge.target === target.id &&
          (pattern.type === undefined || edge.type === pattern.type),
      )
    );
  });
}

export function occurredScenarios(): Set<string> {
  return new Set(
    scenarios
      .filter(
        (scenario) =>
          scenarioMatchesGraph(appState.data, scenario) ||
          appState.history.some((entry) => scenarioMatchesGraph(entry.snapshot.data, scenario)),
      )
      .map((scenario) => scenario.id),
  );
}

export function getImpulseVisualHistory(): ImpulseVisualHistoryEntry[] {
  let nodeHistory: number[][] = [];
  let edgeHistory: number[][] = [];

  for (let index = 0; index < appState.history.length; index += 1) {
    const entry = appState.history[index];
    const { action, snapshot } = entry;
    if (action.type === 'incrementNode' || action.type === 'decrementNode') {
      nodeHistory = [[action.node.id]];
      edgeHistory = [];
    } else if (action.type === 'removeImpulses') {
      nodeHistory = [];
      edgeHistory = [];
    } else if (action.type === 'pushImpulsesDownstream') {
      const afterState = appState.history[index + 1]?.snapshot ?? appState;
      const propagatedEdges = new Set<number>();
      for (const impulse of snapshot.impulses) {
        for (const edge of snapshot.data.edges) {
          if (edge.source !== impulse.nodeId) continue;
          const target = snapshot.data.nodes.find((node) => node.id === edge.target);
          if (target && target.kind !== 'market') propagatedEdges.add(edge.id);
        }
      }

      nodeHistory = [afterState.impulses.map((impulse) => impulse.nodeId), ...nodeHistory].slice(0, 5);
      edgeHistory = [[...propagatedEdges], ...edgeHistory].slice(0, 4);
    } else if (action.type === 'deleteNode') {
      nodeHistory = nodeHistory.map((nodeIds) => nodeIds.filter((id) => id !== action.node.id));
      edgeHistory = edgeHistory.map((edgeIds) =>
        edgeIds.filter(
          (id) =>
            !snapshot.data.edges.some(
              (edge) =>
                edge.id === id && (edge.source === action.node.id || edge.target === action.node.id),
            ),
        ),
      );
    } else if (action.type === 'deleteEdge' || action.type === 'updateEdge') {
      edgeHistory = edgeHistory.map((edgeIds) => edgeIds.filter((id) => id !== action.edge.id));
    }
  }

  return nodeHistory.map((nodeIds, index) => ({
    nodeIds,
    edgeIds: edgeHistory[index] ?? [],
  }));
}

export function isSelected(element: Node | Edge) {
  if (!appState.selected) return false;
  if (isNode(element) && isNode(appState.selected)) return element.id === appState.selected.id;
  if (isEdge(element) && isEdge(appState.selected))
    return element.source === appState.selected.source && element.target === appState.selected.target;
  return false;
}

function appendLog(message: string) {
  appState.logs.push({ message, age: 0 });
}

function updateMarketEquilibrium(market: Node, emitImpulses: boolean): Impulse[] {
  const equilibrium = calculateMarketEquilibrium(appState.data, market);
  const config = market.market;
  if (!equilibrium || !config) {
    return [];
  }

  market.value = equilibrium.price * equilibrium.quantity;
  if (config.priceNodeId === undefined || config.quantityNodeId === undefined) return [];

  const outputImpulses: Impulse[] = [];
  for (const [nodeId, value] of [
    [config.priceNodeId, equilibrium.price],
    [config.quantityNodeId, equilibrium.quantity],
  ] as const) {
    const outputNode = appState.data.nodes.find((node) => node.id === nodeId);
    if (!outputNode) continue;

    const previousValue = outputNode.value;
    outputNode.value = value;
    const delta = Math.sign(value - previousValue);
    if (emitImpulses && delta !== 0) {
      outputImpulses.push({ nodeId: outputNode.id, delta });
    }
    if (emitImpulses && delta !== 0) {
      appendLog(
        `'${market.label}' equilibrium: ${outputNode.label} ${delta > 0 ? 'increased' : 'decreased'} to ${value.toFixed(2)}`,
      );
    }
  }

  return outputImpulses;
}

export function updateApp(event: Event) {
  console.log(event);
  const logCountBeforeUpdate = appState.logs.length;

  if (event.type === 'beginNodeMove') {
    pendingNodeMoveSnapshot = cloneSnapshot(appState);
    return;
  }

  if (event.type === 'endNodeMove') {
    const previousSnapshot = pendingNodeMoveSnapshot;
    pendingNodeMoveSnapshot = undefined;
    const previousNode = previousSnapshot?.data.nodes.find((node) => node.id === event.node.id);
    if (previousSnapshot && previousNode && (previousNode.x !== event.node.x || previousNode.y !== event.node.y)) {
      appState.history.push({
        snapshot: previousSnapshot,
        action: { type: 'moveNode', node: cloneNode(event.node) },
      });
    }
    renderApp();
    return;
  }

  if (event.type === 'undo') {
    const previousEntry = appState.history.pop();
    pendingNodeMoveSnapshot = undefined;
    if (previousEntry) {
      const restoredState = cloneSnapshot(previousEntry.snapshot);
      appState.data = restoredState.data;
      appState.selected = restoredState.selected;
      appState.impulses = restoredState.impulses;
      appState.logs = restoredState.logs;
      appState.recentLogStart = restoredState.recentLogStart;
    }
    renderApp();
    return;
  }

  if (isUndoableEvent(event)) {
    appState.history.push({
      snapshot: cloneSnapshot(appState),
      action: cloneHistoryAction(event),
    });
  }

  switch (event.type) {
    case 'selectNode':
      appState.selected = event.node;
      break;

    case 'renameNode': {
      const originalNode = appState.data.nodes.find((n) => n.id === event.node.id)!;
      originalNode.label = event.node.label;
      break;
    }

    case 'updateMarketConfig': {
      const market = appState.data.nodes.find((node) => node.id === event.node.id);
      if (market?.kind !== 'market' || !market.market) break;
      market.market[event.parameter] = event.value;
      updateMarketEquilibrium(market, false);
      break;
    }

    case 'incrementNode': {
      const targetNode = appState.data.nodes.find((n) => n.id === event.node.id)!;
      if (targetNode.kind === 'market') break;
      targetNode.value += 1;
      appState.impulses = [{ nodeId: targetNode.id, delta: 1 }];
      appendLog(`'${targetNode.label}' manually incremented to ${targetNode.value.toFixed(2)}`);
      break;
    }

    case 'decrementNode': {
      const targetNode = appState.data.nodes.find((n) => n.id === event.node.id)!;
      if (targetNode.kind === 'market') break;
      targetNode.value -= 1;
      appState.impulses = [{ nodeId: targetNode.id, delta: -1 }];
      appendLog(`'${targetNode.label}' manually decremented to ${targetNode.value.toFixed(2)}`);
      break;
    }

    case 'moveNode': {
      const originalNode = appState.data.nodes.find((n) => n.id === event.node.id)!;
      originalNode.x = event.node.x;
      originalNode.y = event.node.y;
      break;
    }

    case 'deleteNode':
      appState.data.nodes = appState.data.nodes.filter((d) => d.id !== event.node.id);
      appState.data.edges = appState.data.edges.filter((e) => e.target !== event.node.id);
      appState.data.edges = appState.data.edges.filter((e) => e.source !== event.node.id);
      appState.selected = undefined;
      break;

    case 'createNode':
      appState.data.nodes.push(event.node);
      appState.selected = event.node;
      break;

    case 'pushImpulsesDownstream': {
      for (const log of appState.logs) {
        log.age += 1;
      }
      const newImpulses: Impulse[] = [];
      const marketsToRecalculate = new Set<Node>();
      for (const impulse of appState.impulses) {
        const downstreamConnections = appState.data.edges.filter((e) => e.source === impulse.nodeId);
        for (const connection of downstreamConnections) {
          const targetNode = getNodeById(appState.data, connection.target);
          if (targetNode.kind === 'market') {
            const config = targetNode.market;
            if (config?.demandNodeId === impulse.nodeId || config?.supplyNodeId === impulse.nodeId) {
              marketsToRecalculate.add(targetNode);
            }
            continue;
          }

          if (connection.type === 'increment') {
            targetNode.value += impulse.delta;
            newImpulses.push({ nodeId: targetNode.id, delta: impulse.delta > 0 ? 1 : -1 });
          }
          if (connection.type === 'decrement') {
            targetNode.value -= impulse.delta;
            newImpulses.push({ nodeId: targetNode.id, delta: impulse.delta > 0 ? -1 : 1 });
          }

          const changeDir = connection.type === 'increment' ? impulse.delta : -impulse.delta;
          const changeType = changeDir >= 0 ? 'incremented' : 'decremented';
          appendLog(`'${targetNode.label}' ${changeType} to ${targetNode.value.toFixed(2)}`);
        }
      }

      for (const market of marketsToRecalculate) {
        const marketImpulses = updateMarketEquilibrium(market, true);
        newImpulses.push(...marketImpulses);
      }

      appState.impulses = newImpulses;
      break;
    }

    case 'removeImpulses':
      appState.impulses = [];
      break;

    case 'createEdge':
      appState.selected = event.edge;
      appState.data.edges.push(event.edge);
      break;

    case 'deleteEdge':
      appState.data.edges = appState.data.edges.filter(
        (e) => e.source !== event.edge.source || e.target !== event.edge.target,
      );
      break;

    case 'selectEdge':
      appState.selected = event.edge;
      break;

    case 'updateEdge':
      for (const edge of appState.data.edges) {
        if (edge.id === event.edge.id) {
          Object.assign(edge, event.edge);
        }
      }
      break;

    case 'exportGraph':
      downloadJson(appState.data);
      break;

    case 'init':
      applyForceLayout(appState.data);
      for (const market of appState.data.nodes.filter((node) => node.kind === 'market')) {
        updateMarketEquilibrium(market, false);
      }
      break;

    case 'distributeNodes':
      applyForceLayout(appState.data, event.parameters);
      break;

    default:
      break;
  }

  if (appState.logs.length > logCountBeforeUpdate) {
    appState.recentLogStart = logCountBeforeUpdate;
  }

  renderApp();

  console.log(appState);
}
