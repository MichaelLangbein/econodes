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
  label: string;
}

interface Graph {
  nodes: Node[];
  edges: Edge[];
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
 * DRAWING
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

  const connectionLabel = rootSvg
    .selectAll('.connectionLabel')
    .data(graph.edges)
    .enter()
    .append('text')
    .attr('class', 'connectionLabel')
    .text((d) => d.label)
    .attr('x', (d) => xScale((getNodeById(graph, d.source).x + getNodeById(graph, d.target).x) / 2))
    .attr('y', (d) => yScale((getNodeById(graph, d.source).y + getNodeById(graph, d.target).y) / 2))
    .exit()
    .remove();

  const nodes = rootSvg
    .selectAll('.node')
    .data(graph.nodes)
    .enter()
    .append('circle')
    .attr('class', 'node')
    .attr('r', '10px')
    .attr('fill', 'grey')
    .attr('outline', 'black')
    .attr('cx', (d) => xScale(d.x))
    .attr('cy', (d) => yScale(d.y))
    .exit()
    .remove();

  const nodeLabels = rootSvg
    .selectAll('.nodeLabel')
    .data(graph.nodes)
    .enter()
    .append('text')
    .attr('class', 'nodeLabel')
    .text((el) => el.label)
    .attr('x', (d) => xScale(d.x))
    .attr('y', (d) => yScale(d.y))
    .exit()
    .remove();

  return { nodes, nodeLabels, connections, connectionLabel };
}

drawGraph(data, rootSvg);
console.log('done');

// allow dragging nodes
// allow creating nodes
// allow connecting nodes
// allow editing nodes
// allow editing connections
// allow changing node-value, watch changes unfold (maybe with tapering?)
// save changes to file
