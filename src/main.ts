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

function isNode(node: any): node is Node {
  return typeof node === 'object' && Object.hasOwn(node, 'id') && Object.hasOwn(node, 'value');
}

function isEdge(edge: any): edge is Edge {
  return (
    typeof edge === 'object' &&
    Object.hasOwn(edge, 'source') &&
    Object.hasOwn(edge, 'target') &&
    typeof edge.source === 'number' &&
    typeof edge.target === 'number'
  );
}

const data: Graph = {
  nodes: [
    { id: 1, x: 0.5, y: 0.25, label: 'A', value: 1 },
    { id: 2, x: 0.25, y: 0.75, label: 'B', value: 2 },
    { id: 3, x: 0.75, y: 0.75, label: 'C', value: 3 },
  ],
  edges: [
    { source: 1, target: 2, label: 'A to B' },
    { source: 2, target: 3, label: 'B to C' },
  ],
};

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
  selected: Node | Edge | undefined;
}

function isSelected(element: Node | Edge) {
  if (!appState.selected) return false;
  if (isEdge(element) && isEdge(appState.selected))
    return element.source === appState.selected.source && element.target === appState.selected.target;
  if (isNode(element) && isNode(appState.selected)) return element.id === appState.selected.id;
  return false;
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
      break;

    case 'deleteNode':
      appState.data.nodes = appState.data.nodes.filter((d) => d.id !== event.node.id);
      appState.data.edges = appState.data.edges.filter((e) => e.target !== event.node.id);
      break;

    case 'createNode':
      appState.data.nodes.push(event.node);
      break;

    case 'init':
    default:
      break;
  }

  // step 2: given state, update app
  drawGraph(appState.data, rootSvg);
  drawNodeForm(appState.selected);

  // step 3: post effects
  switch (event.type) {
    case 'updateNode':
    case 'deleteNode':
      setTimeout(() => updateApp({ type: 'selectNode', node: undefined }));
      break;
    case 'createNode':
      setTimeout(() => updateApp({ type: 'selectNode', node: event.node }));
      break;
    default:
      break;
  }
}

/**********************************************
 * Form setting and reading
 **********************************************/

function drawNodeForm(selected: AppState['selected']) {
  if (!selected || !isNode(selected)) {
    const nodeForm = select('#nodeForm');
    nodeForm.style('display', 'none');
    return;
  }
  const nodeForm = select('#nodeForm');
  nodeForm.style('display', 'block');
  nodeForm.select('input[name="label"]').property('value', selected.label);
  nodeForm.select('input[name="value"]').property('value', selected.value);
  nodeForm.select('button.nodeUpdate').on('click', () => {
    const newNode = { ...selected };
    const nodeForm = select('#nodeForm');
    newNode.label = nodeForm.select('input[name="label"]').property('value');
    newNode.value = +nodeForm.select('input[name="value"]').property('value');
    updateApp({ type: 'updateNode', node: newNode });
  });
  nodeForm.select('button.nodeDelete').on('click', () => {
    updateApp({ type: 'deleteNode', node: selected });
  });
}

select('#nodeCreate').on('click', () =>
  updateApp({
    type: 'createNode',
    node: {
      id: appState.data.nodes.length,
      label: 'New node',
      value: 1,
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

function xFractionOfWay(graph: Graph, startId: number, targetId: number, fraction: number) {
  const startNode = getNodeById(graph, startId);
  const targetNode = getNodeById(graph, targetId);
  const startX = xScale(startNode.x);
  const startY = yScale(startNode.y);
  const targetX = xScale(targetNode.x);
  const targetY = yScale(targetNode.y);
  const fractionX = startX + fraction * (targetX - startX);
  const fractionY = startY + fraction * (targetY - startY);
  return { x: fractionX, y: fractionY };
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
    .selectAll('.connection')
    .data(graph.edges)
    .enter()
    .append('line')
    .attr('class', 'connection')
    .attr('x1', (edge) => xScale(getNodeById(graph, edge.source).x))
    .attr('y1', (edge) => yScale(getNodeById(graph, edge.source).y))
    .attr('x2', (edge) => wayMinusBuffer(graph, edge.source, edge.target, 15).x)
    .attr('y2', (edge) => wayMinusBuffer(graph, edge.source, edge.target, 15).y)
    .attr('stroke', 'black')
    .attr('marker-end', 'url(#arrow)')
    .exit()
    .remove();

  const nodes = rootSvg
    .selectAll<SVGCircleElement, Node>('.node')
    .data(graph.nodes, (d: Node) => d.id)
    .attr('stroke', (d) => (isSelected(d) ? 'black' : 'none'))
    .enter()
    .append('circle')
    .attr('class', 'node')
    .attr('r', '10px')
    .attr('fill', 'grey')
    .attr('stroke', (d) => (isSelected(d) ? 'black' : 'none'))
    .attr('cx', (d) => xScale(d.x))
    .attr('cy', (d) => yScale(d.y))
    .on('click', (event, node) => updateApp({ type: 'selectNode', node }))
    .exit()
    .remove();

  const nodeLabels = rootSvg
    .selectAll<SVGTextElement, Node>('.nodeLabel')
    .data(graph.nodes, (d) => d.id)
    .text((el) => el.label)
    .enter()
    .append('text')
    .attr('class', 'nodeLabel')
    .text((el) => el.label)
    .attr('x', (d) => xScale(d.x))
    .attr('y', (d) => yScale(d.y))
    .exit()
    .remove();
}

/**********************************************
 * Run app
 **********************************************/

updateApp({ type: 'init' });
