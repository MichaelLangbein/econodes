import { select, type Selection } from 'd3-selection';
import { scaleLinear } from 'd3-scale';

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

const rootElement = select('#app');

const rootSvg = rootElement.append('svg').attr('width', '600px').attr('height', '500px').attr('viewBox', '0 0 500 500');

const xScale = scaleLinear([0, 1], [0, 500]); // parseInt(rootSvg.attr('width'))]);
const yScale = scaleLinear([0, 1], [0, 500]); // parseInt(rootSvg.attr('height'))]);

function getNodeById(graph: Graph, id: number) {
  return graph.nodes.find((n) => n.id === id)!;
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
    .attr('x2', (edge) => xScale(getNodeById(graph, edge.target).x))
    .attr('y2', (edge) => yScale(getNodeById(graph, edge.target).y))
    .attr('stroke', 'black')
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
