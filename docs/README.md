# docs

Project documentation is split by audience and purpose.

## Directories

- `architecture/`: system design, compartment boundaries, and long-form technical plans.
- `integrations/`: notes for external systems such as CoralOS and Triton.
- `submission/`: hackathon/demo-facing product notes, judging map, and demo scripts.

## Rules

- Keep implementation details close to the source code when they explain local behavior.
- Keep cross-cutting design decisions here so future contributors can understand why the app is shaped this way.
- Avoid storing secrets, live credentials, private endpoint tokens, or copied dashboard values in docs.
