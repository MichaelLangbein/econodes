import { select } from 'd3-selection';

import { createMarketNode } from './model';
import { appState, updateApp } from './state';
import { initializeRenderer, renderApp } from './render';

initializeRenderer();

select('#nodeCreate').on('click', () =>
  updateApp({
    type: 'createNode',
    node: {
      id: appState.data.nodes.length > 0 ? Math.max(...appState.data.nodes.map((n) => n.id)) + 1 : 1,
      label: 'New node',
      value: 1,
      x: 0.5,
      y: 0.5,
      kind: 'standard',
    },
  }),
);

select('#marketCreate').on('click', () =>
  updateApp({
    type: 'createNode',
    node: createMarketNode({
      id: appState.data.nodes.length > 0 ? Math.max(...appState.data.nodes.map((n) => n.id)) + 1 : 1,
      x: 0.5,
      y: 0.5,
      label: 'New market',
      goodName: 'goods',
      currency: '$',
    }),
  }),
);

select('#edgeCreate').on('click', () => {
  if (appState.data.nodes.length <= 1) {
    console.warn('create at least two nodes before trying to create a connection.');
    return;
  }

  let node1: (typeof appState.data.nodes)[number] | undefined;
  let node2: (typeof appState.data.nodes)[number] | undefined;
  for (const candidateNode1 of appState.data.nodes) {
    for (const candidateNode2 of appState.data.nodes) {
      if (candidateNode1.id === candidateNode2.id) continue;
      const connection = appState.data.edges.find(
        (e) => e.source === candidateNode1.id && e.target === candidateNode2.id,
      );
      if (!connection) {
        node1 = candidateNode1;
        node2 = candidateNode2;
        break;
      }
    }
    if (node1 && node2) {
      break;
    }
  }

  if (!node1 || !node2) {
    console.log("Fully connected graph. You can't create a new edge.");
    return;
  }

  updateApp({
    type: 'createEdge',
    edge: {
      id: appState.data.edges.length > 0 ? Math.max(...appState.data.edges.map((e) => e.id)) + 1 : 1,
      source: node1.id,
      target: node2.id,
      type: 'increment',
    },
  });
  renderApp();
});

select('#distributeNodes').on('click', () => {
  const form = document.querySelector<HTMLFormElement>('#distributeNodesForm');
  if (form) {
    form.hidden = !form.hidden;
  }
});

select<HTMLFormElement, unknown>('#distributeNodesForm').on(
  'submit',
  function (this: HTMLFormElement, event: SubmitEvent) {
    event.preventDefault();
    if (!this.reportValidity()) {
      return;
    }

    const parameters = new FormData(this);
    updateApp({
      type: 'distributeNodes',
      parameters: {
        edgeStrength: Number(parameters.get('edgeStrength')),
        nodeCharge: Number(parameters.get('nodeCharge')),
        centerForce: Number(parameters.get('centerForce')),
      },
    });
    this.hidden = true;
    renderApp();
  },
);

select('#propagateImpulses').on('click', () => {
  updateApp({ type: 'pushImpulsesDownstream' });
  renderApp();
});

select('#undo').on('click', () => {
  updateApp({ type: 'undo' });
});

select('#removeImpulses').on('click', () => {
  updateApp({ type: 'removeImpulses' });
  renderApp();
});

select('#exportGraph').on('click', () => {
  updateApp({ type: 'exportGraph' });
});

updateApp({ type: 'init' });
renderApp();
