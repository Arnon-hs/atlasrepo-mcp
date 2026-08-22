# Publishing atlasrepo-mcp

The npm package is public and unscoped so the user-facing command stays short:

```sh
codex mcp add atlasrepo -- npx -y atlasrepo-mcp
```

## First release

The first release establishes ownership of the currently unclaimed
`atlasrepo-mcp` npm name. Run it from a clean checkout of the reviewed `main`
commit with an npm account protected by two-factor authentication:

```sh
npm ci
npm run check
npm test
npm run build
npm run smoke
npm run smoke:package
npm audit --omit=dev
npm login
npm publish
```

Do not create the `v0.1.0` Git tag until the registry confirms that the package
was published successfully.

## Tokenless releases after bootstrap

In the npm package settings, configure one GitHub Actions trusted publisher:

- organization or user: `Arnon-hs`
- repository: `atlasrepo-mcp`
- workflow filename: `publish.yml`
- allowed action: `npm publish`

The workflow at `.github/workflows/publish.yml` uses GitHub OIDC and does not
read a long-lived npm token. After the trusted publisher is saved, a tag that
exactly matches the version in `package.json` publishes that version:

```sh
git tag v0.1.1
git push origin v0.1.1
```

The job rejects a tag whose version differs from `package.json`, reruns all
quality gates, installs the generated tarball, invokes its real executable, and
publishes only after those checks pass.
