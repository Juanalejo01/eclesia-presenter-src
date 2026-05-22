# Security Policy

## Versiones soportadas

| Versión | Soporte de seguridad |
|---------|---------------------|
| 0.2.x   | ✅ Soporte activo |
| 0.1.x   | ❌ Sin soporte — actualiza a 0.2.x |
| < 0.1   | ❌ Pre-release, sin soporte |

Recomendamos siempre la última release: [github.com/Juanalejo01/eclesia-presenter/releases/latest](https://github.com/Juanalejo01/eclesia-presenter/releases/latest).

## Reportar una vulnerabilidad

> 🔐 **Por favor, NO abras un Issue público para reportar vulnerabilidades de
> seguridad.** Hacerlo expondría el problema antes de que tengamos tiempo de
> publicar un parche, poniendo en riesgo a los usuarios.

### Canal preferido — GitHub Security Advisories

1. Ve a [Security → Report a vulnerability](https://github.com/Juanalejo01/eclesia-presenter/security/advisories/new)
2. Completa el formulario con la información del bug
3. Confidencial hasta que publiquemos el fix

Si no tienes cuenta de GitHub:

### Canal alternativo — Email

📧 **juanlpz.dev@gmail.com**

Asunto: `[SECURITY] <descripción corta>`

Incluye:
- Descripción del problema
- Pasos para reproducir (idealmente con un caso mínimo)
- Versión afectada
- Impacto estimado (¿lectura no autorizada de datos? ¿ejecución remota?
  ¿escalada de privilegios local?)
- Tu nombre / handle para crédito en el changelog (opcional)

## Tiempos de respuesta

| Severidad | Primera respuesta | Fix estimado |
|---|---|---|
| 🔴 Crítica (RCE, exfiltración masiva) | < 24 h | < 7 días |
| 🟠 Alta (privilege escalation, data leak) | < 48 h | < 14 días |
| 🟡 Media (XSS, CSRF, info disclosure) | < 5 días | próxima release |
| 🟢 Baja (mejora defensiva) | < 14 días | en backlog |

Estos son objetivos. Como maintainer solo (no hay equipo), puede haber
retrasos. Te mantendremos informado.

## Política de divulgación coordinada

Seguimos **divulgación coordinada estándar**:

1. Reportas el bug en privado
2. Confirmamos recibo en < 48 h
3. Trabajamos en un fix sin publicar detalles
4. Liberamos el fix en una nueva versión (parche)
5. Publicamos un security advisory con detalles, **acreditándote**
   (a menos que prefieras anonimato)
6. Embargo público de 30 días tras el fix → tiempo para que usuarios
   actualicen antes de revelar detalles técnicos completos

## Alcance del programa

### En scope (queremos saber)

- 🔐 Vulnerabilidades en la app desktop (Electron)
  - IPC sin validación
  - Inyección SQL en queries locales
  - Path traversal en custom protocols (`media://`, `preset://`)
  - Cualquier ejecución remota o local de código no intencionado
- 🌐 Vulnerabilidades en la web (Next.js + Supabase)
  - RLS policies que permitan acceso cross-tenant
  - Bypass de auth de Stripe / Supabase
  - SSRF, XSS, CSRF, injection
- 🔑 Manejo inseguro de license keys o datos de Stripe
- 📡 Inseguridad del servidor LAN embebido (mobile remote)

### Fuera de scope (no son vulnerabilidades)

- ❌ Falta de firma de código del .exe (es conocido, esperando Azure
  Trusted Signing — ver [docs/CODE_SIGNING.md](docs/CODE_SIGNING.md))
- ❌ Aviso de SmartScreen (misma causa que el anterior)
- ❌ Dependencias con vulnerabilidades reportadas pero sin fix upstream
  (las tracking-eamos pero no podemos arreglar lo que está fuera del
  repo)
- ❌ Reportes de scanners automáticos sin validación manual (Snyk,
  npm audit, etc.) — son útiles pero no los aceptamos como reportes
  de seguridad sin contexto
- ❌ Social engineering del maintainer

## Reconocimiento

Mantenemos una lista pública de personas que han reportado vulnerabilidades
en `SECURITY_HALL_OF_FAME.md` (cuando exista — actualmente vacía porque
no se ha reportado ninguna). Si prefieres anonimato, lo respetamos.

---

Gracias por ayudar a mantener EclesiaPresenter seguro para iglesias de
todo el mundo hispanohablante.
