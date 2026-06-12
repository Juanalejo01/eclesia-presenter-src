# Releases cross-repo: esquema de 2 repos

Desde junio 2026 el proyecto está separado en dos repositorios. El código vive
en un repo privado y los releases user-facing en un repo público. Este doc
explica qué vive dónde, cómo publican los workflows y cómo verificar un release.

## Los 2 repos

| | `Juanalejo01/eclesia-presenter-src` (PRIVADO) | `Juanalejo01/eclesia-presenter` (PÚBLICO) |
|---|---|---|
| Código fuente (desktop, web, mobile) | ✅ | ❌ |
| Workflows de CI (tests, release, release-mobile) | ✅ | ❌ |
| Secrets (`ANDROID_*`, `SIGNPATH_*`, `RELEASES_TOKEN`) | ✅ | ❌ |
| Tags `v*` / `mobile-v*` (los pushea el dev aquí) | ✅ | se crean automáticamente al publicar |
| Releases + assets (instaladores, APK, `latest*.yml`) | ❌ | ✅ |
| Página de producto / descargas | ❌ | ✅ |
| Lo que lee el auto-updater desktop (`/releases/latest`) | ❌ | ✅ |
| Lo que lee la web (`/api/download/mobile-apk`, etc.) | ❌ | ✅ |

`package.json -> build.publish` apunta a `Juanalejo01/eclesia-presenter`, por lo
que el `app-update.yml` embebido en los binarios ya resuelve al repo público.

## Cómo publican los workflows

Los workflows corren en el repo privado (donde se pushean los tags), pero el
`GITHUB_TOKEN` de Actions **solo puede escribir en el repo donde corre**. Por
eso el step `softprops/action-gh-release@v2` de `release.yml` y
`release-mobile.yml` usa:

- `repository: Juanalejo01/eclesia-presenter` — publica cross-repo al público.
- `token: ${{ secrets.RELEASES_TOKEN }}` — PAT con permisos sobre el público.
- `target_commitish: main` — el tag NO existe en el repo público; el action
  crea el release y GitHub crea el tag anclado a `main` (rama default del
  público). Nunca se debe heredar el SHA del repo privado, que allí no existe.

Ambos workflows tienen un step guard que falla con error accionable si el
secret `RELEASES_TOKEN` no está configurado.

Los releases mobile (`mobile-v*`) mantienen `prerelease: true` +
`make_latest: false`: si un release mobile quedara como "Latest" del repo
público, el auto-updater de todos los desktops recibiría un 404 al buscar
`latest.yml`.

## Requisitos del PAT (`RELEASES_TOKEN`)

- Tipo: **fine-grained personal access token** (github.com → Settings →
  Developer settings → Fine-grained tokens).
- Repository access: **Only select repositories → `Juanalejo01/eclesia-presenter`**
  (solo el público; NO darle acceso al privado).
- Permissions: **Contents → Read and write** (suficiente para crear releases,
  tags y subir assets). Nada más.
- Expiración: los fine-grained PAT expiran (máx. 1 año). **Renovarlo
  anualmente** y actualizar el secret `RELEASES_TOKEN` en
  `eclesia-presenter-src` → Settings → Secrets and variables → Actions.

## Verificación post-release

Tras publicar un tag (`v*` o `mobile-v*`):

1. **Página de releases**: el release aparece en
   <https://github.com/Juanalejo01/eclesia-presenter/releases> con sus assets.
   Los `v*` deben quedar como "Latest"; los `mobile-v*` como "Pre-release".
2. **Auto-updater desktop** (solo `v*`): desde una instalación con versión
   anterior, arrancar la app y comprobar que detecta y descarga la nueva
   versión (lee `latest.yml` de `/releases/latest` del repo público).
3. **Descarga de APK** (solo `mobile-v*`): la web
   `/api/download/mobile-apk` debe redirigir/servir el APK del nuevo release.
