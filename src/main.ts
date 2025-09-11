import { select, type Selection } from 'd3-selection';
import { scaleLinear } from 'd3-scale';

/**********************************************
 * DATA
 **********************************************/

interface Node {
  id: number;
  x: number; // between 0 and 1
  y: number; // between 0 and 1
  label: string;
  value: string;
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
    { id: 1, x: 0.5, y: 0.25, label: 'A', value: '1' },
    { id: 2, x: 0.25, y: 0.75, label: 'B', value: '2' },
    { id: 3, x: 0.75, y: 0.75, label: 'C', value: '3' },
  ],
  edges: [
    { source: 1, target: 2 },
    { source: 2, target: 3 },
  ],
};

function updateNode(updatedNode: Node, graph: Graph) {
  const originalNode = graph.nodes.find((n) => n.id === updatedNode.id)!;

  // if label change, update all nodes value-expressions to match
  for (const node of graph.nodes) {
    if (node.value.includes(originalNode.label)) {
      node.value.replace(originalNode.label, updatedNode.label);
    }
  }

  // if value change, check that references exist and update edges
  updateEdges(graph);
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
  const parts = valueString.split('"');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part in matches) {
      parts[i] = matches[part] + '';
    }
  }
  const substituted = parts.join();
  return substituted;
}

function updateEdges(graph: Graph) {
  graph.edges = [];
  for (const targetNode of graph.nodes) {
    const labels = extractLabels(targetNode.value);
    for (const label of labels) {
      const sourceNode = graph.nodes.find((n) => n.label === label);
      if (sourceNode) graph.edges.push({ source: sourceNode.id, target: targetNode.id });
    }
  }
}

function evaluateValueString(valueString: string, graph: Graph): number {
  const labels = extractLabels(valueString);
  const matchedValues: { [key: string]: number } = {};
  for (const label of labels) {
    const valueString = graph.nodes.find((n) => n.label === label)!.value;
    matchedValues[label] = evaluateValueString(valueString, graph);
  }
  const subsitutedString = substitute(valueString, matchedValues);
  const evaluated: number = eval(subsitutedString);
  return evaluated;
}

/**********************************************
 * State Management
 **********************************************/

type Event =
  | { type: 'init' }
  | { type: 'selectNode'; node?: Node }
  | { type: 'updateNode'; node: Node }
  | { type: 'deleteNode'; node: Node }
  | { type: 'createNode'; node: Node };

interface AppState {
  data: Graph;
  selected: Node | undefined;
}

function isSelected(node: Node) {
  if (!appState.selected) return false;
  return node.id === appState.selected.id;
}

const appState: AppState = {
  data,
  selected: undefined,
};

function updateApp(event: Event) {
  console.log(event);

  // step 1: change state
  switch (event.type) {
    case 'selectNode':
      appState.selected = event.node;
      break;

    case 'updateNode':
      for (let i = 0; i < appState.data.nodes.length; i++) {
        if (appState.data.nodes[i].id === event.node.id) {
          appState.data.nodes[i] = event.node;
        }
      }
      appState.selected = undefined;
      break;

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
  nodeForm.select('input[name="value"]').property('value', selected.value);
  nodeForm.select('button.nodeUpdate').on('click', () => {
    const newNode = { ...selected };
    const nodeForm = select('#nodeForm');
    newNode.label = nodeForm.select('input[name="label"]').property('value');
    newNode.value = nodeForm.select('input[name="value"]').property('value');
    updateApp({ type: 'updateNode', node: newNode });
  });
  nodeForm.select('button.nodeDelete').on('click', () => {
    updateApp({ type: 'deleteNode', node: selected });
  });
  nodeForm.select('button.nodeDeselect').on('click', () => updateApp({ type: 'selectNode', node: undefined }));
}

select('#nodeCreate').on('click', () =>
  updateApp({
    type: 'createNode',
    node: {
      id: Math.max(...appState.data.nodes.map((n) => n.id)) + 1,
      label: 'New node',
      value: '1',
      x: 0.5,
      y: 0.5,
    },
  })
);

/**********************************************
 * SVG Setup
 **********************************************/

const rootElement = select('#app');

const viewBoxX = 500;
const viewBoxY = 500;
const xScale = scaleLinear([0, 1], [0, viewBoxX]);
const yScale = scaleLinear([0, 1], [0, viewBoxY]);

const rootSvg = rootElement
  .append('svg')
  .attr('width', '600px')
  .attr('height', '500px')
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

function getNodeById(graph: Graph, id: number) {
  return graph.nodes.find((n) => n.id === id)!;
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

function drawGraph(graph: Graph, rootSvg: Selection<SVGSVGElement, unknown, HTMLElement, any>) {
  const connections = rootSvg
    .selectAll<SVGLineElement, Edge>('.connection')
    .data(graph.edges, (e) => `${e.source}->${e.target}`);
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
    .attr('stroke', (d) => (isSelected(d) ? 'black' : 'none'));
  nodes
    .enter()
    .append('circle')
    .attr('class', 'node')
    .attr('r', '10px')
    .attr('fill', 'grey')
    .attr('stroke', (d) => (isSelected(d) ? 'black' : 'none'))
    .attr('cx', (d) => xScale(d.x))
    .attr('cy', (d) => yScale(d.y))
    .on('click', (_, node) => updateApp({ type: 'selectNode', node }))
    .on('drag', (evt, _) => console.log(evt));
  nodes.exit().remove();

  const nodeLabels = rootSvg
    .selectAll<SVGTextElement, Node>('.nodeLabel')
    .data(graph.nodes, (d) => d.id)
    .text((el) => el.label);
  nodeLabels
    .enter()
    .append('text')
    .attr('class', 'nodeLabel')
    .text((el) => el.label)
    .attr('x', (d) => xScale(d.x))
    .attr('y', (d) => yScale(d.y))
    .on('click', (_, node) => updateApp({ type: 'selectNode', node }));
  nodeLabels.exit().remove();
}

/**********************************************
 * Run app
 **********************************************/

updateApp({ type: 'init' });
