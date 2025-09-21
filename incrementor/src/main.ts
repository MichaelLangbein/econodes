import { select, type Selection } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { drag } from 'd3-drag';

function unique<T>(lst: T[]): T[] {
  return Array.from(new Set(lst));
}

/**********************************************
 * Model data and helpers
 **********************************************/

interface Node {
  id: number;
  x: number; // between 0 and 1
  y: number; // between 0 and 1
  label: string;
  value: number;
}

interface Edge {
  id: number;
  source: Node['id'];
  target: Node['id'];
  type: "increment" | "decrement";
}

interface Graph {
  nodes: Node[];
  edges: Edge[];
}

function isNode(el: any): el is Node {
  return (
    typeof el === 'object' &&
    el !== null &&
    typeof el.id === 'number' &&
    typeof el.x === 'number' &&
    typeof el.y === 'number' &&
    typeof el.label === 'string' &&
    typeof el.value === 'number'
  );
}

function isEdge(el: any): el is Edge {
  return (
    typeof el === 'object' &&
    el !== null &&
    typeof el.source === 'number' &&
    typeof el.target === 'number' &&
    (el.type === 'increment' || el.type === 'decrement')
  );
}

const data: Graph = {
  nodes: [
    { id: 1, x: 0.5, y: 0.25, label: 'A', value: 1 },
    { id: 2, x: 0.25, y: 0.75, label: 'B', value: 2 },
    { id: 3, x: 0.75, y: 0.75, label: 'C', value: 3 },
  ],
  edges: [
    { id: 1, source: 1, target: 2, type: 'increment' },
    { id: 2, source: 2, target: 3, type: 'increment' },
  ],
};

function getNodeById(graph: Graph, id: number) {
  return graph.nodes.find((n) => n.id === id)!;
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
  | { type: 'renameNode'; node: Node }
  | { type: 'incrementNode'; node: Node }
  | { type: 'decrementNode'; node: Node }
  | { type: 'deleteNode'; node: Node }
  | { type: 'createNode'; node: Node }
  | { type: 'pushImpulsesDownstream' }
  | { type: 'removeImpulses'}
  | { type: 'selectEdge'; edge?: Edge }
  | { type: 'updateEdge'; edge: Edge }
  | { type: 'deleteEdge'; edge: Edge }
  | { type: 'createEdge'; edge: Edge }
  | { type: "exportGraph"; };

interface AppState {
  data: Graph;
  selected?: Node | Edge;
  impulses: number[];
}

function isSelected(element: Node | Edge) {
  if (!appState.selected) return false;
  if (isNode(element) && isNode(appState.selected)) return element.id === appState.selected.id;
  if (isEdge(element) && isEdge(appState.selected)) return element.source === appState.selected.source && element.target === appState.selected.target;
  return false;
}

const appState: AppState = {
  data,
  selected: undefined,
  impulses: []
};

function updateApp(event: Event) {
  console.log(event);

  // step 1: change state
  switch (event.type) {
    case 'selectNode':
      appState.selected = event.node;
      break;

    case 'renameNode':
      let originalNode = appState.data.nodes.find((n) => n.id === event.node.id)!;
      originalNode.label = event.node.label;
      break;

    case 'incrementNode':
      const targetNode = appState.data.nodes.find(n => n.id === event.node.id)!;
      targetNode.value += 1;
      appState.impulses.push(targetNode.id);
      break;

    case 'decrementNode':
      const targetNode1 = appState.data.nodes.find(n => n.id === event.node.id)!;
      targetNode1.value -= 1;
      appState.impulses.push(targetNode1.id);
      break;

    case 'moveNode':
      const originalNode1 = appState.data.nodes.find((n) => n.id === event.node.id)!;
      originalNode1.x = event.node.x;
      originalNode1.y = event.node.y;
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

    case 'pushImpulsesDownstream':
      const newImpulses: number[] = [];
      for (const nodeId of appState.impulses) {
        const downstreamConnections = appState.data.edges.filter(e => e.source === nodeId);
        for (const connection of downstreamConnections) {
          const targetNode = getNodeById(appState.data, connection.target);
          if (connection.type === "increment") targetNode.value += 1;
          if (connection.type === "decrement") targetNode.value -= 1;
          newImpulses.push(targetNode.id);
        }
      }
      appState.impulses = unique(newImpulses);
      break;

    case 'removeImpulses':
      appState.impulses = [];
      break;

      case 'createEdge':
        appState.selected = event.edge;
      //   for (const edge of appState.data.edges) {
      //     if (edge.source === event.edge.source && edge.target === event.edge.target) {
      //       console.log("Edge already exists", edge);
      //       return;
      //   }
      // }
      appState.data.edges.push(event.edge);
      break;

    case 'deleteEdge':
      appState.data.edges = appState.data.edges.filter(e => e.source !== event.edge.source || e.target !== event.edge.target);
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
    default:
      break;
  }

  // step 2: given state, update app
  drawGraph(appState.data, rootSvg);
  drawNodeForm(appState.selected);
  drawEdgeForm(appState.selected);

  console.log(appState);
}

/**********************************************
 * Form setting and reading
 **********************************************/

function drawNodeForm(selected: AppState['selected']) {
  const nodeForm = select('#nodeForm');

  if (!selected || !isNode(selected)) {
    nodeForm.style('opacity', '0');
    return;
  }
  nodeForm.style('opacity', '1');

  nodeForm.select('input[name="label"]').property('value', selected.label);
  nodeForm.select('#valueSpan').property('innerHTML', selected.value);

  nodeForm.select('input[name="label"]').on('change', () => {
    const newNode = { ...selected };
    const nodeForm = select('#nodeForm');
    newNode.label = nodeForm.select('input[name="label"]').property('value');
    updateApp({ type: 'renameNode', node: newNode });
  });

  nodeForm
    .select('button.nodeIncrement')
    .on('click', () => updateApp({type: 'incrementNode', node: selected}));

  nodeForm
    .select('button.nodeDecrement')
    .on('click', () => updateApp({type: 'decrementNode', node: selected}));

  nodeForm
    .select('button.pushImpulsesDownstream')
    .on('click', () => updateApp({ type: 'pushImpulsesDownstream' }));

  nodeForm.select('button.nodeDeselect').on('click', () => updateApp({ type: 'selectNode', node: undefined }));
    
  nodeForm.select('button.nodeDelete').on('click', () => {
    updateApp({ type: 'deleteNode', node: selected });
  });
}


function drawEdgeForm(selected: AppState['selected']) {
  const edgeForm = select('#edgeForm');
  
  if (!selected || !isEdge(selected)) {
    edgeForm.style('opacity', '0');
    return;
  }
  edgeForm.style('opacity', '1');

  // Populate source dropdown
  const sourceSelect = edgeForm.select('select[name="source"]');
  sourceSelect.selectAll<HTMLOptionElement, Node>('option')
    .data(appState.data.nodes, (d: Node) => d.id)
    .join(
      enter => enter.append('option')
        .attr('value', d => d.id)
        .text(d => d.label),
      update => update
        .attr('value', d => d.id)
        .text(d => d.label),
      exit => exit.remove()
    );
  sourceSelect.property('value', selected.source);

  // Populate target dropdown
  const targetSelect = edgeForm.select('select[name="target"]');
  targetSelect.selectAll<HTMLOptionElement, Node>('option')
    .data(appState.data.nodes, (d: Node) => d.id)
    .join(
      enter => enter.append('option')
        .attr('value', d => d.id)
        .text(d => d.label),
      update => update
        .attr('value', d => d.id)
        .text(d => d.label),
      exit => exit.remove()
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

  edgeForm.select('select[name="mode"]')
    .on('change', function () {
      const newType = (this as HTMLSelectElement).value as Edge['type'];
      updateApp({type: 'updateEdge',edge: { ...selected, type: newType }});
    });
}


select('#nodeCreate').on('click', () =>
  updateApp({
    type: 'createNode',
    node: {
      id: appState.data.nodes.length > 0 ? Math.max(...appState.data.nodes.map((n) => n.id)) + 1 : 1,
      label: 'New node',
      value: 1,
      x: 0.5,
      y: 0.5,
    },
  })
);


select('#edgeCreate').on('click', () => {
  if (appState.data.nodes.length <= 1) return;
  const node1 = appState.data.nodes[0];
  const node2 = appState.data.nodes[1];
    updateApp({
      type: 'createEdge',
      edge: {
        id: appState.data.edges.length > 0 ? Math.max(...appState.data.edges.map(e => e.id)) + 1 : 1,
        source: node1.id,
        target: node2.id,
        type: 'increment'
      },
    })
});

select('#propagateImpulses').on('click', () => updateApp({type: 'pushImpulsesDownstream'}));

select('#removeImpulses').on('click', () => updateApp({type: 'removeImpulses'}));

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
  const radiusScale = scaleLinear([0, maxVal], [5, 50]).clamp(true);

  const connections = rootSvg
    .selectAll<SVGLineElement, Edge>('.connection')
    .data(graph.edges, (e) => `${e.source}->${e.target}`)
    .attr('x1', (edge) => xScale(getNodeById(graph, edge.source).x))
    .attr('y1', (edge) => yScale(getNodeById(graph, edge.source).y))
    .attr('x2', (edge) => wayMinusBuffer(graph, edge.source, edge.target, radiusScale(getNodeById(graph, edge.target).value)).x)
    .attr('y2', (edge) => wayMinusBuffer(graph, edge.source, edge.target, radiusScale(getNodeById(graph, edge.target).value)).y);
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
    .attr('stroke', (d) => (isSelected(d) ? 'black' : appState.impulses.includes(d.id) ? 'blue' : 'none'))
    .attr('cx', (d) => xScale(d.x))
    .attr('cy', (d) => yScale(d.y))
    .attr('r', d => radiusScale(d.value) + 'px');
  nodes
    .enter()
    .append('circle')
    .attr('class', 'node')
    .attr('r', d => radiusScale(d.value) + 'px')
    .attr('fill', 'grey')
    .attr('stroke', (d) => (isSelected(d) ? 'black' : appState.impulses.includes(d.id) ? 'blue' : 'none'))
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
