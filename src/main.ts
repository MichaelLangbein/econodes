import { select, type Selection } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { drag } from 'd3-drag';

/**********************************************
 * Model data and helpers
 **********************************************/

/**
 * We deliberately keep value and valueExpression side by side
 * - even though one _should_ be derived from the other.
 * Because we want to slowly iterate through the graph,
 * re-evaluating valueExpression on every step, to _visually_ update value.
 * It is by design that these two may be inconsistent for a while.
 *
 * Edges, too, can be derived from value-expressions. Still we maintain them explicitly.
 * Here, however, this is more for performance reasons.
 */

interface Node {
  id: number;
  x: number; // between 0 and 1
  y: number; // between 0 and 1
  label: string;
  valueExpression: string;
  value: number;
}

interface Edge {
  source: Node['id'];
  target: Node['id'];
}

interface Graph {
  nodes: Node[];
  edges: Edge[];
}

const data: Graph = {
  nodes: [
    { id: 1, x: 0.5, y: 0.25, label: 'A', valueExpression: '1', value: 1 },
    { id: 2, x: 0.25, y: 0.75, label: 'B', valueExpression: '"A" + 1', value: 2 },
    { id: 3, x: 0.75, y: 0.75, label: 'C', valueExpression: '"B" + 1', value: 3 },
  ],
  edges: [
    { source: 1, target: 2 },
    { source: 2, target: 3 },
  ],
};

function updateNode(updatedNode: Node, graph: Graph) {
  let originalNode = graph.nodes.find((n) => n.id === updatedNode.id)!;

  // copy over primitive values
  originalNode = Object.assign(originalNode, updatedNode);

  // if label change, update all nodes value-expressions to match
  for (const node of graph.nodes) {
    if (node.valueExpression.includes(originalNode.label)) {
      node.valueExpression.replace(originalNode.label, updatedNode.label);
    }
  }

  // if value change, check that references exist and update edges
  updateEdges(graph);

  // re-evaluate value
  originalNode.value = evaluateValueString(updatedNode.valueExpression, graph, false);
}

function updateEdges(graph: Graph) {
  graph.edges = [];
  for (const targetNode of graph.nodes) {
    const labels = extractLabels(targetNode.valueExpression);
    for (const label of labels) {
      const sourceNode = graph.nodes.find((n) => n.label === label);
      if (sourceNode) graph.edges.push({ source: sourceNode.id, target: targetNode.id });
    }
  }
}

function extractLabels(valueString: string): string[] {
  const labels = [];
  let currentLabel: string | undefined = undefined;
  for (const currentChar of valueString) {
    if (currentChar === '"') {
      if (currentLabel === undefined) {
        currentLabel = '';
      } else {
        labels.push(currentLabel);
        currentLabel = undefined;
      }
    } else {
      if (currentLabel !== undefined) currentLabel += currentChar;
    }
  }
  return labels;
}

function substitute(valueString: string, matches: { [key: string]: number }) {
  const parts = valueString.split('"').filter((p) => p !== '');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part in matches) {
      parts[i] = matches[part] + '';
    }
  }
  const substituted = parts.join('');
  return substituted;
}

function evaluateValueString(valueString: string, graph: Graph, recursive = true): number {
  const labels = extractLabels(valueString);
  const matchedValues: { [key: string]: number } = {};
  for (const label of labels) {
    const node = graph.nodes.find((n) => n.label === label)!
    if (recursive) {
      const valueString = node.valueExpression;
      matchedValues[label] = evaluateValueString(valueString, graph, recursive);
    } else {
      matchedValues[label] = node.value;
    }
  }
  const subsitutedString = substitute(valueString, matchedValues);
  const evaluated: number = eval(subsitutedString);
  return evaluated;
}

function getNodeById(graph: Graph, id: number) {
  return graph.nodes.find((n) => n.id === id)!;
}

function getChildren(node: Node, graph: Graph) {
  const children = graph.edges
      .filter(e => e.source === node.id)
      .map(e => e.target)
      .map(targetId => getNodeById(graph, targetId));
  return children;
}

function unique<T, I>(lst: T[], idFunc: (t: T) => I) {
  const seen = new Set<I>();
  const result: T[] = [];
  for (const item of lst) {
    const id = idFunc(item);
    if (!seen.has(id)) {
      seen.add(id);
      result.push(item);
    }
  }
  return result;
}

function getNthGenChildren(node: Node, depth: number, graph: Graph): Node[] {
  if (depth === 0) return [node];
  if (depth === 1) return getChildren(node, graph);

  const descendants: Node[] = [];
  const directChildren = getChildren(node, graph);
  for (const child of directChildren) {
    descendants.push(...getNthGenChildren(child, depth - 1, graph));
  }

  return unique(descendants, (d => d.id));
}

function downloadJson(graph: Graph) {
  const dataStr = JSON.stringify(graph, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "graph.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}


/**********************************************
 * State Management
 **********************************************/

type Event =
  | { type: 'init' }
  | { type: 'selectNode'; node?: Node }
  | { type: 'moveNode'; node: Node }
  | { type: 'updateNode'; node: Node }
  | { type: 'deleteNode'; node: Node }
  | { type: 'createNode'; node: Node }
  | { type: 'evaluateDownstream'; node: Node }
  | { type: "exportGraph"; };

interface AppState {
  data: Graph;
  selected: Node | undefined;
  evalDepth: number | undefined;
}

function isSelected(node: Node) {
  if (!appState.selected) return false;
  return node.id === appState.selected.id;
}

const appState: AppState = {
  data,
  selected: undefined,
  evalDepth: undefined
};

function updateApp(event: Event) {
  console.log(event);

  // step 1: change state
  switch (event.type) {
    case 'selectNode':
      appState.selected = event.node;
      appState.evalDepth = undefined;
      break;

    case 'updateNode':
      updateNode(event.node, appState.data);
      break;

    case 'moveNode':
      for (let i = 0; i < appState.data.nodes.length; i++) {
        if (appState.data.nodes[i].id === event.node.id) {
          appState.data.nodes[i] = event.node;
        }
      }
      break;

    case 'deleteNode':
      appState.data.nodes = appState.data.nodes.filter((d) => d.id !== event.node.id);
      appState.data.edges = appState.data.edges.filter((e) => e.target !== event.node.id);
      appState.data.edges = appState.data.edges.filter((e) => e.source !== event.node.id);
      appState.selected = undefined;
      break;

    case 'createNode':
      event.node.value = evaluateValueString(event.node.valueExpression, appState.data, false);
      appState.data.nodes.push(event.node);
      appState.selected = event.node;
      break;

    case 'evaluateDownstream':
      if (appState.evalDepth === undefined) appState.evalDepth = 0;
      appState.evalDepth += 1;
      let childNodes = getNthGenChildren(event.node, appState.evalDepth, appState.data);
      if (childNodes.length === 0) {
        // start again at 0
        appState.evalDepth = 0; 
        childNodes = [event.node];
      }
      for (const childNode of childNodes) {
        const originalValue = childNode.value;
        updateNode(childNode, appState.data);
        const newValue = childNode.value;
        const changeLine = `${childNode.label}: ${originalValue} -> ${newValue}`;
        select('#logContainer').append('span').property('innerHTML', changeLine);
      }
      break;

      case 'exportGraph':
        downloadJson(appState.data);
        break;

    case 'init':
    default:
      break;
  }

  // step 2: given state, update app
  drawGraph(appState.data, rootSvg);
  drawNodeForm(appState.selected);

  console.log(appState);
}

/**********************************************
 * Form setting and reading
 **********************************************/

function drawNodeForm(selected: AppState['selected']) {
  if (!selected) {
    const nodeForm = select('#nodeForm');
    nodeForm.style('opacity', '0');
    return;
  }

  const nodeForm = select('#nodeForm');
  nodeForm.style('opacity', '1');
  nodeForm.select('input[name="label"]').property('value', selected.label);
  nodeForm.select('input[name="valueExpression"]').property('value', selected.valueExpression);
  nodeForm.select('span#valueSpan').property('innerHTML', selected.value);

  nodeForm.select('button.nodeUpdate').on('click', () => {
    const newNode = { ...selected };
    const nodeForm = select('#nodeForm');
    newNode.label = nodeForm.select('input[name="label"]').property('value');
    newNode.valueExpression = nodeForm.select('input[name="valueExpression"]').property('value');
    updateApp({ type: 'updateNode', node: newNode });
  });

  nodeForm.select('button.nodeDelete').on('click', () => {
    updateApp({ type: 'deleteNode', node: selected });
  });

  nodeForm.select('button.nodeDeselect').on('click', () => updateApp({ type: 'selectNode', node: undefined }));

  nodeForm
    .select('button.evaluateDownstream')
    .on('click', () => updateApp({ type: 'evaluateDownstream', node: selected }));
  nodeForm.select('button.evaluateUpstream').on('click', () => updateApp({ type: 'evaluateUpstream', node: selected }));
}


select('#nodeCreate').on('click', () =>
  updateApp({
    type: 'createNode',
    node: {
      id: appState.data.nodes.length > 0 ? Math.max(...appState.data.nodes.map((n) => n.id)) + 1 : 1,
      label: 'New node',
      value: 1,
      valueExpression: '1',
      x: 0.5,
      y: 0.5,
    },
  })
);


select('#exportGraph').on('click', () => updateApp({type: 'exportGraph'}));



/**********************************************
 * SVG Setup
 **********************************************/

// const rootElement = select('#app');

const viewBoxX = 500;
const viewBoxY = 350;
const xScale = scaleLinear([0, 1], [0, viewBoxX]);
const yScale = scaleLinear([0, 1], [0, viewBoxY]);

const rootSvg = select<SVGSVGElement, unknown>('#svg')
  .attr('viewBox', `0 0 ${viewBoxX} ${viewBoxY}`);
const defs = rootSvg.append('defs');
defs
  .append('marker')
  .attr('id', 'arrow')
  .attr('viewBox', '0 0 10 10')
  .attr('refX', '5')
  .attr('refY', '5')
  .attr('markerWidth', '6')
  .attr('markerHeight', '6')
  .attr('orient', 'auto-start-reverse')
  .append('path')
  .attr('d', 'M 0 0 L 10 5 L 0 10 z');

/**********************************************
 * Drawing functions
 **********************************************/

class Breaker<T> {
  private queue?: T;
  private scheduled?: number;

  constructor(private timeout: number, private callback: (d: T) => undefined) {}

  enqueue(datum: T) {
    this.queue = datum;
    if (!this.scheduled) {
      this.scheduled = setTimeout(() => {
        this.callback(this.queue!);
        this.scheduled = undefined;
        this.queue = undefined;
      }, this.timeout);
    }
  }
}

const dragBreaker = new Breaker<{ evt: DragEvent; node: Node }>(50, ({ evt, node }) => {
  updateApp({ type: 'moveNode', node });
});


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

function drawGraph(graph: Graph, rootSvg: Selection<SVGSVGElement, unknown, HTMLElement, any>) {
  const maxVal = Math.max(...graph.nodes.map(n => n.value));
  const radiusScale = scaleLinear([0, maxVal], [5, 50]);

  const connections = rootSvg
    .selectAll<SVGLineElement, Edge>('.connection')
    .data(graph.edges, (e) => `${e.source}->${e.target}`)
    .attr('x1', (edge) => xScale(getNodeById(graph, edge.source).x))
    .attr('y1', (edge) => yScale(getNodeById(graph, edge.source).y))
    .attr('x2', (edge) => wayMinusBuffer(graph, edge.source, edge.target, 15).x)
    .attr('y2', (edge) => wayMinusBuffer(graph, edge.source, edge.target, 15).y);
  connections
    .enter()
    .append('line')
    .attr('class', 'connection')
    .attr('x1', (edge) => xScale(getNodeById(graph, edge.source).x))
    .attr('y1', (edge) => yScale(getNodeById(graph, edge.source).y))
    .attr('x2', (edge) => wayMinusBuffer(graph, edge.source, edge.target, 15).x)
    .attr('y2', (edge) => wayMinusBuffer(graph, edge.source, edge.target, 15).y)
    .attr('stroke', 'black')
    .attr('marker-end', 'url(#arrow)');
  connections.exit().remove();

  const nodes = rootSvg
    .selectAll<SVGCircleElement, Node>('.node')
    .data(graph.nodes, (d: Node) => d.id)
    .attr('stroke', (d) => (isSelected(d) ? 'black' : 'none'))
    .attr('cx', (d) => xScale(d.x))
    .attr('cy', (d) => yScale(d.y))
    .attr('r', d => radiusScale(d.value) + 'px');
  nodes
    .enter()
    .append('circle')
    .attr('class', 'node')
    .attr('r', d => radiusScale(d.value) + 'px')
    .attr('fill', 'grey')
    .attr('stroke', (d) => (isSelected(d) ? 'black' : 'none'))
    .attr('cx', (d) => xScale(d.x))
    .attr('cy', (d) => yScale(d.y))
    .on('click', (_, node) => updateApp({ type: 'selectNode', node }))
    .call(drag<SVGCircleElement, Node>().on('drag', (evt, node) => {
        node.x += xScale.invert(evt.dx);
        node.y += yScale.invert(evt.dy);
        dragBreaker.enqueue({ evt, node });
    }));
  nodes.exit().remove();

  const nodeLabels = rootSvg
    .selectAll<SVGTextElement, Node>('.nodeLabel')
    .data(graph.nodes, (d) => d.id)
    .text((el) => el.label + ": " + el.value)
    .attr('x', (d) => xScale(d.x))
    .attr('y', (d) => yScale(d.y));
  nodeLabels
    .enter()
    .append('text')
    .attr('class', 'nodeLabel')
    .text((el) => el.label + ": " + el.value)
    .attr('x', (d) => xScale(d.x))
    .attr('y', (d) => yScale(d.y))
    .on('click', (_, node) => updateApp({ type: 'selectNode', node }));
  nodeLabels.exit().remove();
}

/**********************************************
 * Run app
 **********************************************/

updateApp({ type: 'init' });
