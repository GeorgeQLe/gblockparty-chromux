# Localhost first-success fixture

This dependency-free fixture binds only to `127.0.0.1`, serves no external
resources, and prints exactly one canonical discovery line:

```text
Local: http://localhost:43117/
```

Run it from `prototype/` with:

```sh
npm run fixture:localhost-first-success
```

Set `PORT` to choose another port. `PORT=0` asks the operating system for an
ephemeral port and is used by automated tests. The routes are `/` and
`/healthz`; every other path returns `404`.
