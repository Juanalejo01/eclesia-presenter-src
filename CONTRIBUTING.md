# Contribuir a EclesiaPresenter

Gracias por interesarte en mejorar EclesiaPresenter. Este documento te guía
para que tu contribución sea efectiva.

> **TL;DR**: abre un Issue antes de mandar PR, sigue [Conventional Commits](https://www.conventionalcommits.org/),
> los tests deben pasar en CI, y trata a otros con respeto (ver [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)).

---

## Tipos de contribución bienvenidos

| Tipo | Cómo |
|---|---|
| 🐛 **Reportar un bug** | [Open issue → Bug report](https://github.com/Juanalejo01/eclesia-presenter/issues/new?template=bug_report.yml) |
| 💡 **Pedir una feature** | [Open issue → Feature request](https://github.com/Juanalejo01/eclesia-presenter/issues/new?template=feature_request.yml) |
| ❓ **Preguntar** | [Discussions](https://github.com/Juanalejo01/eclesia-presenter/discussions) (preferido) o [Issue → Question](https://github.com/Juanalejo01/eclesia-presenter/issues/new?template=question.yml) |
| 📖 **Mejorar docs** | PR directo. La doc está en `docs/`, en `web/app/docs/_data/docs.js`, y en este README |
| 🌍 **Traducir** | Edita `src/renderer/services/i18n.js` añadiendo o completando un locale (ver sección abajo) |
| 🎨 **Diseño / UX** | Abre Discussion con mockups; si es pequeño, PR directo |
| 🔐 **Vulnerabilidad de seguridad** | NO abrir Issue público — leer [SECURITY.md](SECURITY.md) |

---

## Antes de empezar

### Setup local

```bash
git clone https://github.com/Juanalejo01/eclesia-presenter.git
cd eclesia-presenter
npm install
npm run dev   # Vite en :5173 + Electron
```

Para la web (Next.js):
```bash
cd web
npm install
npm run dev   # Next en :3000
```

### Ejecutar tests antes de hacer commit

```bash
npm test       # Jest unit tests (~5s)
npm run e2e    # Playwright E2E (lanza next dev) (~1 min)
```

Si CI falla y tus tests pasan localmente, abre un Issue — probablemente sea
un problema del entorno de Actions, no de tu código.

### Stack y estructura del proyecto

Ver [README.md → Arquitectura](README.md#-arquitectura). Los puntos clave:

- `src/main/` — Electron main process (Node, no JSX, no DOM)
- `src/renderer/` — React (Vite-bundled)
- `web/` — Next.js 14 (App Router)
- `src/server/` — Express + socket.io para mobile remote
- Persistencia: SQLite via `better-sqlite3` localmente, Postgres (Supabase) en cloud

---

## Workflow de contribución

### 1. Discute antes de implementar
Para cualquier cambio **mayor a 50 líneas o que toque arquitectura**:
1. Abre un Issue describiendo qué quieres hacer y por qué
2. Espera comentario del maintainer (juanlpz.dev@gmail.com) — normalmente
   < 48 h
3. Si recibes 👍 o un comentario "go ahead", empieza el PR

Para cambios pequeños (typo, dependency bump, test fix, etc.), PR directo.

### 2. Branch + commits
- Branch desde `main`: `git checkout -b fix/algo-descriptivo`
- Mensajes de commit en formato **[Conventional Commits](https://www.conventionalcommits.org/)**:
  - `feat(scope): nueva feature`
  - `fix(scope): corrección`
  - `docs: cambios solo en documentación`
  - `chore: tooling, deps, build`
  - `test: añadir o mejorar tests`
  - `refactor: cambio sin afectar comportamiento`

Ejemplos del proyecto:
- ✅ `feat(cloud-sync): trigger inmediato debounced 2s`
- ✅ `fix(fondos): placeholder por categoría cuando el thumbnail 404`
- ❌ `cambios varios`
- ❌ `update`

### 3. Tests
- **Cualquier feature nueva**: añade al menos 1 unit test (en `__tests__/`) o E2E (en `e2e/`)
- **Cualquier bug fix**: añade un test que reproduzca el bug ANTES del fix
- Coverage objetivo: 70%+ para módulos puros, no obligatorio para componentes UI

### 4. Pull Request
- Usa el [template](.github/PULL_REQUEST_TEMPLATE.md) — está pre-rellenado al abrir el PR
- Vincula el Issue que resuelve: `Closes #123`
- CI debe pasar **antes** de pedir review (tests + build)
- Espera revisión — el maintainer responde en < 5 días hábiles

---

## Guías específicas

### Traducir la app a un idioma nuevo

1. Abre `src/renderer/services/i18n.js`
2. Añade tu locale al objeto `DICT` (copia de `es` o `en` como base)
3. Añade tu locale al array `AVAILABLE_LOCALES`:
   ```js
   { id: 'fr', label: 'Français', flag: 'FR' }
   ```
4. Traduce todas las keys. Si dejas alguna sin traducir, hace fallback a `es`.
5. Test manual: arranca con `npm run dev`, Ajustes → Idioma, selecciona el nuevo
6. PR con título `feat(i18n): añadir locale fr (français)`

### Añadir una biblia nueva

1. Convierte tu fuente a JSON con el formato del proyecto (ver `public/bibles/RVR1909.json` como ejemplo)
2. Coloca el archivo en `public/bibles/`
3. Añade la entrada al manifiesto (ver `src/renderer/services/bibleService.js`)
4. **Importante**: si la biblia tiene copyright, NO se incluye en el repo — solo
   debe poder importarse vía "Importar Biblia" desde el panel de Ajustes

### Reportar regresiones de Playwright

Si un E2E pasa local pero falla en CI:
1. Ejecuta `npm run e2e:ui` localmente para reproducir
2. Si es flaky (intermitente), añade `await page.waitForLoadState('networkidle')`
3. Si es del entorno (mobile-chrome, etc.), comenta en el Issue de la regresión

---

## Filosofía del proyecto

Ver [ROADMAP.md → Filosofía](ROADMAP.md#-filosofía). Resumen:

1. **La iglesia primero** — features que ayuden a pastores no técnicos
2. **Sin lock-in** — formatos abiertos (JSON / SQLite), datos exportables
3. **Free core, Pro sostén** — núcleo gratis MIT, monetización en cloud sync

PRs que vayan en contra de estos principios serán cerrados con explicación.

---

## Reconocimiento

Toda contribución mergeada se acredita en:
- Lista de contribuidores del repo (auto, GitHub la genera)
- Sección de "Agradecimientos" del README (manualmente, para contribuciones grandes)

¡Gracias por hacer EclesiaPresenter mejor para la comunidad! 🙏
