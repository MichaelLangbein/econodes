import { select, type Selection } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { drag } from 'd3-drag';
import { zoom } from 'd3-zoom';
import {
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

import {
  defaultMarketParameters,
  type Edge,
  type Graph,
  type MarketParameters,
  type Node,
  getNodeById,
  isEdge,
  isNode,
} from './model';
import {
  getImpulseVisualHistory,
  occurredScenarios,
  scenarios,
  type AppState,
  type Scenario,
  appState,
  isSelected,
  updateApp,
} from './state';

const viewBoxX = 500;
const viewBoxY = 350;
const xScale = scaleLinear([0, 1], [0, viewBoxX]);
const yScale = scaleLinear([0, 1], [0, viewBoxY]);
const impulseColors = ['#f97316', '#dc8035', '#756049', '#504d49'] as const;

let rootGroup: Selection<SVGGElement, any, SVGSVGElement, any> | undefined;

function nodeImpulseColor(nodeId: number, history: ReturnType<typeof getImpulseVisualHistory>) {
  const age = history.findIndex((entry) => entry.nodeIds.includes(nodeId));
  return age < 0 || age > 4 ? 'grey' : impulseColors[Math.min(age, impulseColors.length - 1)];
}

function edgeImpulseColor(edgeId: number, history: ReturnType<typeof getImpulseVisualHistory>) {
  const generation = history.findIndex((entry) => entry.edgeIds.includes(edgeId));
  const age = generation + 1;
  return generation < 0 || age > 4 ? 'black' : impulseColors[Math.min(age, impulseColors.length - 1)];
}

export interface ForceLayoutParameters {
  edgeStrength: number;
  nodeCharge: number;
  centerForce: number;
}

export const defaultForceLayoutParameters: ForceLayoutParameters = {
  edgeStrength: 0.4,
  nodeCharge: -550,
  centerForce: 0.04,
};

export function applyForceLayout(
  graph: Graph,
  parameters: ForceLayoutParameters = defaultForceLayoutParameters,
  iterations = 30_000,
) {
  interface LayoutNode extends Omit<Node, 'x' | 'y'>, SimulationNodeDatum {
    x: number;
    y: number;
  }
  interface LayoutLink extends SimulationLinkDatum<LayoutNode> {
    id: number;
    type: Edge['type'];
  }

  const layoutNodes: LayoutNode[] = graph.nodes.map((node) => ({
    ...node,
    x: node.x * viewBoxX,
    y: node.y * viewBoxY,
  }));
  const layoutLinks: LayoutLink[] = graph.edges.map((edge) => ({ ...edge }));
  const simulation = forceSimulation<LayoutNode, LayoutLink>(layoutNodes)
    .force(
      'link',
      forceLink<LayoutNode, LayoutLink>(layoutLinks)
        .id((node) => node.id)
        .distance(90)
        .strength(parameters.edgeStrength),
    )
    .force('charge', forceManyBody<LayoutNode>().strength(parameters.nodeCharge))
    .force('x', forceX<LayoutNode>(viewBoxX / 2).strength(parameters.centerForce))
    .force('y', forceY<LayoutNode>(viewBoxY / 2).strength(parameters.centerForce))
    .stop();

  for (let i = 0; i < iterations; i += 1) {
    simulation.tick();
  }

  for (let index = 0; index < graph.nodes.length; index += 1) {
    graph.nodes[index].x = layoutNodes[index].x / viewBoxX;
    graph.nodes[index].y = layoutNodes[index].y / viewBoxY;
  }
}

export function initializeRenderer() {
  const rootSvg = select<SVGSVGElement, unknown>('#svg');
  if (rootSvg.empty()) {
    return;
  }

  rootSvg.attr('viewBox', `0 0 ${viewBoxX} ${viewBoxY}`);

  const svgDefs = rootSvg.selectAll('defs').data([null]).join('defs');
  const arrowMarker = svgDefs.selectAll('marker').data([null]).join('marker');
  arrowMarker
    .attr('id', 'arrow')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', '5')
    .attr('refY', '5')
    .attr('markerWidth', '6')
    .attr('markerHeight', '6')
    .attr('orient', 'auto-start-reverse');

  arrowMarker.selectAll('path').data([null]).join('path').attr('d', 'M 0 0 L 10 5 L 0 10 z');

  rootGroup = rootSvg.selectAll<SVGGElement, unknown>('g.app-root').data([null]).join('g').attr('class', 'app-root');

  const zoomBehavior = zoom<SVGSVGElement, unknown>();
  rootSvg.call(zoomBehavior.on('zoom', (evt) => rootGroup?.attr('transform', evt.transform)));
}

function wayFraction(graph: Graph, startId: number, targetId: number, fraction: number) {
  const startNode = getNodeById(graph, startId);
  const targetNode = getNodeById(graph, targetId);
  const startX = xScale(startNode.x);
  const startY = yScale(startNode.y);
  const targetX = xScale(targetNode.x);
  const targetY = yScale(targetNode.y);
  const deltaX = targetX - startX;
  const deltaY = targetY - startY;
  const fracX = startX + fraction * deltaX;
  const fracY = startY + fraction * deltaY;
  return { x: fracX, y: fracY };
}

function wayMinusBuffer(graph: Graph, startId: number, targetId: number, buffer: number) {
  const startNode = getNodeById(graph, startId);
  const targetNode = getNodeById(graph, targetId);
  const startX = xScale(startNode.x);
  const startY = yScale(startNode.y);
  const targetX = xScale(targetNode.x);
  const targetY = yScale(targetNode.y);
  const deltaX = targetX - startX;
  const deltaY = targetY - startY;
  const distanceTotal = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const distanceReduced = distanceTotal - buffer;
  const fractionOfWay = distanceReduced / distanceTotal;
  const fractionX = startX + deltaX * fractionOfWay;
  const fractionY = startY + deltaY * fractionOfWay;
  return { x: fractionX, y: fractionY };
}

export function drawGraph(graph: Graph, root: Selection<SVGGElement, any, SVGSVGElement, any>) {
  const maxVal = Math.max(...graph.nodes.map((n) => n.value));
  const radiusScale = scaleLinear([0, maxVal], [5, 50]).clamp(true);
  const impulseHistory = getImpulseVisualHistory();

  const connections = root
    .selectAll<SVGLineElement, Edge>('.connection')
    .data(graph.edges, (e) => `${e.source}->${e.target}`)
    .attr('stroke', (edge) => edgeImpulseColor(edge.id, impulseHistory))
    .attr('x1', (edge) => xScale(getNodeById(graph, edge.source).x))
    .attr('y1', (edge) => yScale(getNodeById(graph, edge.source).y))
    .attr(
      'x2',
      (edge) => wayMinusBuffer(graph, edge.source, edge.target, radiusScale(getNodeById(graph, edge.target).value)).x,
    )
    .attr(
      'y2',
      (edge) => wayMinusBuffer(graph, edge.source, edge.target, radiusScale(getNodeById(graph, edge.target).value)).y,
    );
  connections
    .enter()
    .append('line')
    .attr('class', 'connection')
    .attr('x1', (edge) => xScale(getNodeById(graph, edge.source).x))
    .attr('y1', (edge) => yScale(getNodeById(graph, edge.source).y))
    .attr('x2', (edge) => wayMinusBuffer(graph, edge.source, edge.target, 15).x)
    .attr('y2', (edge) => wayMinusBuffer(graph, edge.source, edge.target, 15).y)
    .attr('stroke', (edge) => edgeImpulseColor(edge.id, impulseHistory))
    .attr('marker-end', 'url(#arrow)')
    .on('click', (_, edge) => updateApp({ type: 'selectEdge', edge }));
  connections.exit().remove();

  const connectionLabelGroups = root
    .selectAll<SVGGElement, Edge>('.connectionLabel')
    .data(graph.edges, (e) => `${e.source}-${e.target}`)
    .attr(
      'transform',
      (edge) =>
        `translate(${wayFraction(graph, edge.source, edge.target, 0.5).x}, ${
          wayFraction(graph, edge.source, edge.target, 0.5).y
        })`,
    );
  connectionLabelGroups
    .select('text')
    .text((e) => (e.type === 'increment' ? '+' : '-'))
    .attr('transform', 'translate(-4.5, 5)');
  const connectionLabelsNew = connectionLabelGroups
    .enter()
    .append('g')
    .attr('class', 'connectionLabel')
    .attr(
      'transform',
      (edge) =>
        `translate(${wayFraction(graph, edge.source, edge.target, 0.5).x}, ${
          wayFraction(graph, edge.source, edge.target, 0.5).y
        })`,
    );
  connectionLabelsNew
    .append('circle')
    .attr('r', 5)
    .attr('fill', 'lightgrey')
    .on('click', (_, e) => updateApp({ type: 'selectEdge', edge: e }));
  connectionLabelsNew
    .append('text')
    .text((e) => (e.type === 'increment' ? '+' : '-'))
    .attr('transform', 'translate(-4.5, 5)')
    .attr('pointer-events', 'none');
  connectionLabelGroups.exit().remove();

  const nodes = root
    .selectAll<SVGCircleElement, Node>('.node')
    .data(graph.nodes, (d: Node) => d.id)
    .attr('stroke', (d) => (isSelected(d) ? 'black' : d.kind === 'market' ? '#1d4ed8' : 'none'))
    .attr('fill', (d) => (d.kind === 'market' ? '#dbeafe' : nodeImpulseColor(d.id, impulseHistory)))
    .attr('stroke-width', (d) => (d.kind === 'market' ? 2.5 : 1))
    .attr('cx', (d) => xScale(d.x))
    .attr('cy', (d) => yScale(d.y))
    .attr('r', (d) => radiusScale(d.value) + (d.kind === 'market' ? 10 : 0) + 'px');
  nodes
    .enter()
    .append('circle')
    .attr('class', 'node')
    .attr('r', (d) => radiusScale(d.value) + (d.kind === 'market' ? 10 : 0) + 'px')
    .attr('fill', (d) => (d.kind === 'market' ? '#dbeafe' : nodeImpulseColor(d.id, impulseHistory)))
    .attr('stroke', (d) => (isSelected(d) ? 'black' : d.kind === 'market' ? '#1d4ed8' : 'none'))
    .attr('stroke-width', (d) => (d.kind === 'market' ? 2.5 : 1))
    .attr('cx', (d) => xScale(d.x))
    .attr('cy', (d) => yScale(d.y))
    .on('click', (_, node) => updateApp({ type: 'selectNode', node }))
    .on('mouseenter', (_, node) => {
      root
        .selectAll<SVGTextElement, Node>('.nodeLabel')
        .attr('fill', (labelNode) => (labelNode.id === node.id ? 'black' : 'gray'));
    })
    .on('mouseleave', () => {
      root.selectAll<SVGTextElement, Node>('.nodeLabel').attr('fill', 'gray');
    })
    .call(
      drag<SVGCircleElement, Node>()
        .on('start', () => updateApp({ type: 'beginNodeMove' }))
        .on('drag', (evt, node) => {
          node.x += xScale.invert(evt.dx);
          node.y += yScale.invert(evt.dy);
          updateApp({ type: 'moveNode', node });
        })
        .on('end', (_, node) => updateApp({ type: 'endNodeMove', node })),
    );
  nodes.exit().remove();

  const nodeLabels = root
    .selectAll<SVGTextElement, Node>('.nodeLabel')
    .data(graph.nodes, (d) => d.id)
    .text((el) => (el.kind === 'market' ? el.label : `${el.label}: ${el.value.toFixed(2)}`))
    .attr('x', (d) => xScale(d.x))
    .attr('y', (d) => yScale(d.y))
    .attr('fill', 'gray')
    .attr('font-size', '9px')
    .attr('pointer-events', 'none');
  nodeLabels
    .enter()
    .append('text')
    .attr('class', 'nodeLabel')
    .text((el) => (el.kind === 'market' ? el.label : `${el.label}: ${el.value.toFixed(2)}`))
    .attr('x', (d) => xScale(d.x))
    .attr('y', (d) => yScale(d.y))
    .attr('fill', 'gray')
    .attr('font-size', '9px')
    .attr('pointer-events', 'none');
  nodeLabels.exit().remove();
}

export function drawNodeForm(selected: AppState['selected']) {
  const nodeForm = select('#nodeForm');

  if (!selected || !isNode(selected)) {
    nodeForm.style('opacity', '0');
    return;
  }
  nodeForm.style('opacity', '1');

  const marketSummary =
    selected.kind === 'market' && selected.market ? ` · ${selected.market.goodName} / ${selected.market.currency}` : '';

  nodeForm.select('input[name="label"]').property('value', selected.label);
  nodeForm.select('#valueSpan').property('innerHTML', selected.kind === 'market' ? marketSummary : selected.value);
  nodeForm.select('button.nodeIncrement').style('display', selected.kind === 'market' ? 'none' : '');
  nodeForm.select('button.nodeDecrement').style('display', selected.kind === 'market' ? 'none' : '');
  nodeForm.select('#marketConfigForm').property('hidden', selected.kind !== 'market');

  if (selected.kind === 'market' && selected.market) {
    const parameterNames: (keyof MarketParameters)[] = [
      'demandSlope',
      'supplySlope',
      'demandChokePrice',
      'supplyQuantityAtZero',
    ];
    for (const name of parameterNames) {
      const input = nodeForm.select<HTMLInputElement>(`input[name="${name}"]`);
      input.property('value', selected.market[name] ?? defaultMarketParameters[name]);
      input.on('change', function () {
        const inputElement = this as HTMLInputElement;
        if (!inputElement.validity.valid) return;
        updateApp({
          type: 'updateMarketConfig',
          node: selected,
          parameter: name,
          value: Number(inputElement.value),
        });
      });
    }
  }

  nodeForm.select('input[name="label"]').on('change', () => {
    const newNode = { ...selected };
    const nodeForm = select('#nodeForm');
    newNode.label = nodeForm.select('input[name="label"]').property('value');
    updateApp({ type: 'renameNode', node: newNode });
  });

  nodeForm.select('button.nodeIncrement').on('click', () => {
    updateApp({ type: 'incrementNode', node: selected });
  });

  nodeForm.select('button.nodeDecrement').on('click', () => {
    updateApp({ type: 'decrementNode', node: selected });
  });

  nodeForm.select('button.pushImpulsesDownstream').on('click', () => {
    updateApp({ type: 'pushImpulsesDownstream' });
  });

  nodeForm.select('button.nodeDeselect').on('click', () => {
    updateApp({ type: 'selectNode', node: undefined });
  });

  nodeForm.select('button.nodeDelete').on('click', () => {
    updateApp({ type: 'deleteNode', node: selected });
  });
}

export function drawEdgeForm(selected: AppState['selected']) {
  const edgeForm = select('#edgeForm');

  if (!selected || !isEdge(selected)) {
    edgeForm.style('opacity', '0');
    return;
  }
  edgeForm.style('opacity', '1');

  const sourceSelect = edgeForm.select('select[name="source"]');
  sourceSelect
    .selectAll<HTMLOptionElement, Node>('option')
    .data(appState.data.nodes, (d: Node) => d.id)
    .join(
      (enter) =>
        enter
          .append('option')
          .attr('value', (d) => d.id)
          .text((d) => d.label),
      (update) => update.attr('value', (d) => d.id).text((d) => d.label),
      (exit) => exit.remove(),
    );
  sourceSelect.property('value', selected.source);

  const targetSelect = edgeForm.select('select[name="target"]');
  targetSelect
    .selectAll<HTMLOptionElement, Node>('option')
    .data(appState.data.nodes, (d: Node) => d.id)
    .join(
      (enter) =>
        enter
          .append('option')
          .attr('value', (d) => d.id)
          .text((d) => d.label),
      (update) => update.attr('value', (d) => d.id).text((d) => d.label),
      (exit) => exit.remove(),
    );
  targetSelect.property('value', selected.target);

  edgeForm.select('select[name="mode"]').property('value', selected.type);

  edgeForm.select('select[name="source"]').on('change', function () {
    const sourceId = +(this as HTMLSelectElement).value;
    updateApp({ type: 'updateEdge', edge: { ...selected, source: sourceId } });
  });

  edgeForm.select('select[name="target"]').on('change', function () {
    const targetId = +(this as HTMLInputElement).value;
    updateApp({ type: 'updateEdge', edge: { ...selected, target: targetId } });
  });

  edgeForm.select('select[name="mode"]').on('change', function () {
    const newType = (this as HTMLSelectElement).value as Edge['type'];
    updateApp({ type: 'updateEdge', edge: { ...selected, type: newType } });
  });

  edgeForm.select('.edgeDelete').on('click', () => {
    updateApp({ type: 'deleteEdge', edge: selected });
  });

  edgeForm.select('.edgeDeselect').on('click', () => {
    updateApp({ type: 'selectEdge' });
  });
}

function drawLogs() {
  const logContainer = select('#logContainer');
  logContainer.selectAll('p').remove();
  logContainer
    .selectAll('p')
    .data(appState.logs)
    .join('p')
    .classed('recent-log', (_, index) => index >= appState.recentLogStart)
    .style('color', (entry) =>
      entry.age > 4 ? 'gray' : impulseColors[Math.min(entry.age, impulseColors.length - 1)],
    )
    .text((entry) => entry.message);
}

function drawScenarios() {
  const matchedScenarioIds = occurredScenarios();
  select<HTMLDivElement, unknown>('#scenarioContainer')
    .selectAll<HTMLParagraphElement, Scenario>('p')
    .data(scenarios, (scenario) => scenario.id)
    .join('p')
    .classed('scenario-detected', (scenario) => matchedScenarioIds.has(scenario.id))
    .text((scenario) =>
      matchedScenarioIds.has(scenario.id)
        ? `${scenario.name} - occurred`
        : `${scenario.name} - not yet observed`,
    )
    .attr('title', (scenario) => scenario.description);
}

export function renderApp() {
  if (!rootGroup) {
    initializeRenderer();
  }

  if (!rootGroup) {
    return;
  }

  drawGraph(appState.data, rootGroup);
  drawNodeForm(appState.selected);
  drawEdgeForm(appState.selected);
  drawLogs();
  drawScenarios();
  select('#undo').property('disabled', appState.history.length === 0);
}
