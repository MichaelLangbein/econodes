# Design principles

- Prefer simplicity.
- Prefer fewer dependencies.
- Code readability matters.
- Prefer a functional coding style.

# Current state

- This is intended as an economics simulation. Allows the user to create a node, change its value, and watch changes to other nodes unfold one step at a time.
- Allows to create nodes and edges. A user may poke a node, incrementing or decrementing its value.
- Edges propagate the change in a source node to target nodes, either by incrementing or decrementing the target node.
- A basic model is already prepared

# Todo

1. as a user propagates changes through the model, compare the development with a list of pre-defined scenarios (those will be defined later, but will include things like "greek debt crisis", or "beautiful deleveraging"). If a certain development matches a scenario, highlight the relevant steps in the Log and label them with the scenario name.
