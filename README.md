# pi-status-bars

Shared renderer for semantic Pi status segments above and below the editor.

## Background

Internal Pi extension scaffold. Publishers will supply segments; one renderer will own the
lines and their layout. The current extension factory is a no-op: it draws nothing and
registers no handlers. The contract export is reserved for the separate implementation.

## Install

From the local checkout, install the pinned tools and development dependencies:

```bash
mise install && bun install
```

Pi packages are host-provided peers. TypeBox is the runtime schema dependency.

## Usage

Load the scaffold for one Pi session without changing package settings:

```bash
pi --extension ./src/index.ts
```

No lines or publisher integration are implemented yet.

## Development

```bash
mise run lint
mise run typecheck
mise run test
```

The canonical Bun test runner rejects zero tests and supplies positive-count proof to the
repository-local Test Gate.

## Contributing

Open questions and bug reports in the repository's issues. Pull requests are welcome;
run the development checks above before submitting changes.

## License

[MIT](LICENSE) © 2026 Rubio-Enterprises.
