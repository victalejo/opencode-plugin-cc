# Plugin de opencode para Claude Code

[![CI](https://github.com/victalejo/opencode-plugin-cc/actions/workflows/pull-request-ci.yml/badge.svg)](https://github.com/victalejo/opencode-plugin-cc/actions/workflows/pull-request-ci.yml)

Usa [opencode](https://opencode.ai) desde Claude Code para revisiones de código o para delegar tareas.

> Read this in [English](README.md).

Este plugin es un port del `codex-plugin-cc` de OpenAI que cambia el backend de Codex por la [CLI de opencode](https://opencode.ai/docs/cli). Cada tarea o revisión llama por debajo a `opencode run --format json`, captura el stream JSONL de eventos y expone el ID de sesión que devuelve, para que puedas retomar el hilo después con `opencode run --continue --session <id>`. El mismo flujo vive del lado de Claude Code: slash commands, un subagent de rescate, un review gate opcional al cerrar el turno, tracking de jobs en background y reporte de resultados.

## Qué incluye

- `/opencode:review` — revisión de código *read-only* sobre el estado actual de git
- `/opencode:adversarial-review` — revisión orientada a *cuestionar* el diseño, con texto de focus personalizable
- `/opencode:rescue`, `/opencode:status`, `/opencode:result`, `/opencode:cancel` — delegar trabajo y manejar jobs en background
- `/opencode:diff` — muestra un git diff acotado a los archivos que opencode tocó en el último rescue
- `/opencode:sessions` — lista las sesiones de opencode disponibles para retomar en este workspace
- `/opencode:setup` — verifica que opencode esté instalado, ofrece instalarlo si falta, y controla el review gate al cierre de turno

## Requisitos

- **CLI de opencode** (`opencode --version` debe funcionar). Instalación:
  - `npm install -g opencode-ai`, o
  - `curl -fsSL https://opencode.ai/install | bash` (ver [docs de opencode](https://opencode.ai/docs))
- **Al menos un provider configurado** (Anthropic, OpenAI, OpenRouter, etc.). Corre `opencode auth login` para configurar uno.
- **Node.js 18.18 o superior** (lo usa el runtime que envuelve a opencode).
- **Claude Code** (este plugin corre dentro del sistema de plugins de Claude Code).

## Instalación

Agrega el marketplace en Claude Code:

```bash
/plugin marketplace add victalejo/opencode-plugin-cc
```

Instala el plugin:

```bash
/plugin install opencode@opencode-plugin-cc
```

Recarga los plugins:

```bash
/reload-plugins
```

Después corre:

```bash
/opencode:setup
```

`/opencode:setup` te dice si opencode está instalado y si tienes al menos un provider configurado. Si opencode falta y `npm` está disponible, el comando ofrece instalarlo por ti.

Si opencode está instalado pero no hay provider configurado:

```bash
!opencode auth login
```

Después de instalar deberías ver:

- los slash commands listados abajo
- el subagent `opencode:rescue` en `/agents`

Un primer flujo típico:

```bash
/opencode:review --background
/opencode:status
/opencode:result
```

## Uso

### `/opencode:review`

Corre una revisión de código de opencode sobre el cambio actual. Útil cuando quieres:

- una revisión de tus cambios sin commitear
- una revisión de tu rama contra una base como `main`

Usa `--base <ref>` para revisar la rama. Soporta `--wait` y `--background`. No es *steerable* y no toma texto de focus — para eso usa [`/opencode:adversarial-review`](#opencodeadversarial-review) cuando quieras cuestionar una decisión o área de riesgo específica.

Ejemplos:

```bash
/opencode:review
/opencode:review --base main
/opencode:review --background
```

Este comando es read-only y no modifica nada. Cuando lo corres en background, usa [`/opencode:status`](#opencodestatus) para ver el progreso y [`/opencode:cancel`](#opencodecancel) para abortarlo.

### `/opencode:adversarial-review`

Corre una revisión **steerable** que cuestiona la implementación y el diseño elegidos.

Sirve para presionar suposiciones, tradeoffs, modos de falla, y si un approach distinto hubiera sido más seguro o más simple.

Usa el mismo objetivo que `/opencode:review`, incluyendo `--base <ref>`. También soporta `--wait` y `--background`. A diferencia de `/opencode:review`, acepta texto de focus después de las flags.

Ejemplos:

```bash
/opencode:adversarial-review
/opencode:adversarial-review --base main cuestiona si el diseño de caching y reintentos fue el correcto
/opencode:adversarial-review --background busca race conditions y cuestiona el approach elegido
```

Este comando es read-only. No modifica código.

### `/opencode:rescue`

Le pasa una tarea a opencode a través del subagent `opencode:rescue`.

Úsalo cuando quieras que opencode:

- investigue un bug
- intente un fix
- continúe una tarea previa de opencode
- haga un pase más rápido o más barato con un modelo distinto

Soporta `--background`, `--wait`, `--resume`, `--fresh`, `--model <provider/model>`, y `--context <file1,file2,...>`. Si omites `--resume` y `--fresh`, el plugin puede ofrecerte continuar el último rescue del repo.

`--context` recibe una lista separada por comas de paths de archivos (relativos al workspace) y los inlina en el prompt que se le envía a opencode, así opencode no tiene que gastar un turno de descubrimiento re-localizándolos.

Ejemplos:

```bash
/opencode:rescue investiga por qué los tests empezaron a fallar
/opencode:rescue arregla el test que falla con el parche más pequeño que sea seguro
/opencode:rescue --resume aplica el fix principal de la corrida anterior
/opencode:rescue --model anthropic/claude-sonnet-4-20250514 investiga el test de integración inestable
/opencode:rescue --background investiga la regresión
/opencode:rescue --context src/auth.ts,src/auth.test.ts explica por qué falla el nuevo test de auth
```

También puedes pedirlo en prosa y se delegará a opencode:

```text
Pídele a opencode que rediseñe la conexión a la base de datos para que sea más resiliente.
```

Notas:

- Si no pasas `--model`, opencode usa el default de `~/.config/opencode/opencode.json`.
- Las peticiones de rescue siguientes pueden continuar la última tarea de opencode del repo con `--resume`.

### `/opencode:status`

Muestra los jobs de opencode activos y recientes del repositorio actual.

```bash
/opencode:status
/opencode:status task-abc123
```

### `/opencode:result`

Muestra la salida final guardada de un job terminado, incluyendo el session ID de opencode para que puedas reabrirlo con `opencode run --continue --session <id>`.

```bash
/opencode:result
/opencode:result task-abc123
```

### `/opencode:cancel`

Cancela un job en background activo.

```bash
/opencode:cancel
/opencode:cancel task-abc123
```

### `/opencode:diff`

Muestra un `git diff HEAD` más un `git status --porcelain` acotados a los archivos que opencode reportó haber tocado en el último (o especificado) rescue. Útil para revisar rápido sólo los cambios que produjo un rescue con `--write`, sin que se mezcle con cambios paralelos tuyos.

```bash
/opencode:diff
/opencode:diff task-abc123
```

Si el job resuelto no tocó archivos (por ejemplo, un rescue read-only), el comando lo reporta explícitamente y te apunta a `/opencode:result`.

### `/opencode:sessions`

Lista las sesiones de opencode disponibles para retomar. Por defecto filtra al directorio del workspace actual.

```bash
/opencode:sessions
/opencode:sessions --all
/opencode:sessions --max-count 50
```

Cada fila muestra el session id, el título, la edad relativa y el directorio donde se inició la sesión. Para retomar una sesión específica desde opencode, copia su id y corre:

```bash
opencode run --continue --session <session-id>
```

### `/opencode:setup`

Verifica si opencode está instalado y autenticado. Si opencode falta y npm está disponible, ofrece instalarlo.

También se usa para manejar el review gate opcional.

#### Activar el review gate

```bash
/opencode:setup --enable-review-gate
/opencode:setup --disable-review-gate
```

Cuando el review gate está activo, el plugin usa un hook `Stop` para correr una revisión enfocada de opencode sobre el turno anterior de Claude. Si la revisión encuentra problemas, el stop se bloquea para que Claude los resuelva primero.

> [!WARNING]
> El review gate puede generar un loop largo entre Claude y opencode, y puede drenar tu cuota del provider rápidamente. Actívalo solo cuando vayas a monitorear la sesión activamente.

## Flujos típicos

### Revisar antes de mergear

```bash
/opencode:review
```

### Pasarle un problema a opencode

```bash
/opencode:rescue investiga por qué falla el build en CI
```

### Combinar modelos (multi-modelo en el mismo workflow)

Una de las cosas más útiles de este plugin: usar Claude Sonnet en Claude Code para escribir código, y configurar opencode con un modelo más barato (`gpt-4.1-mini`, `qwen-coder`, `deepseek`, etc.) para que `/opencode:review` te corra revisiones en background mientras sigues trabajando. También sirve para *adversarial reviews* con un modelo distinto, para no caer en el sesgo de un solo modelo evaluándose a sí mismo.

Ejemplo:

```bash
# Mientras escribes con Sonnet en Claude Code:
/opencode:adversarial-review --background cuestiona si el approach de caching es el correcto
# Sigues trabajando, y luego:
/opencode:status
/opencode:result
```

### Empezar algo largo

```bash
/opencode:adversarial-review --background
/opencode:rescue --background investiga el test inestable
```

Después chequea con:

```bash
/opencode:status
/opencode:result
```

## Cómo se integra con opencode

Este plugin llama a la [CLI de opencode](https://opencode.ai/docs/cli) en cada tarea o revisión. El runtime:

1. Lanza `opencode run --format json [--continue --session <id>] [--model …] [--agent plan|build]` desde la raíz del workspace.
2. Escribe el prompt al stdin del proceso hijo (para que diffs largos y metacaracteres del shell sobrevivan limpiamente en Windows y POSIX).
3. Parsea el stream JSONL de eventos (`step_start`, `text`, `step_finish`, `tool_call`) y extrae el texto final del asistente, los archivos tocados y el session id.
4. Persiste metadata de los jobs bajo `${plugin-data}/state/<workspace>/...` para que `/opencode:status` y `/opencode:result` funcionen entre turnos. Cada job terminado guarda su session id de opencode para que puedas reanudarlo después con `opencode run --continue --session <id>`.

Los jobs en background lanzan un worker detached que reusa el mismo flujo y actualiza el archivo del job a medida que opencode emite eventos.

### Configuración común

El modelo y provider por defecto vienen de opencode, así que cualquier cosa que tengas en `~/.config/opencode/opencode.json` (o en un `opencode.json` por proyecto) aplica también a las tareas del plugin. Por ejemplo:

```json
{
  "model": "anthropic/claude-sonnet-4-20250514"
}
```

Ver [docs de configuración de opencode](https://opencode.ai/docs/config) para la lista completa.

### Retomar un job desde opencode directamente

`/opencode:result` imprime el session id de opencode usado por el job. Para abrir esa sesión directamente en opencode:

```bash
opencode run --continue --session <session-id>
```

## Preguntas frecuentes

### ¿Necesito una cuenta separada de opencode?

No — opencode es agnóstico al provider. Conectas el que ya tengas (Anthropic, OpenAI, OpenRouter, etc.) con `opencode auth login`. El plugin usa tu CLI local de opencode.

### ¿El plugin levanta un opencode nuevo en cada comando?

Sí — cada comando corre `opencode run` como un proceso fresco. opencode mismo persiste sesiones en disco (`~/.local/share/opencode/...`), así que retomar con `--continue --session <id>` reutiliza el mismo historial.

### ¿Puedo apuntar el plugin a un binario de opencode custom?

Sí. Configura `OPENCODE_BIN=/path/to/opencode` y el runtime lanzará ese binario en lugar de buscar `opencode` en el PATH.

### ¿Dónde se guarda el estado?

El estado de jobs por workspace, los logs y el endpoint del server se guardan bajo `$CLAUDE_PLUGIN_DATA/state/<workspace-slug>/` si esa variable está definida; si no, bajo `os.tmpdir()/codex-companion/<workspace-slug>/`.

## Licencia

Apache-2.0. Este proyecto deriva del `codex-plugin-cc` de OpenAI bajo la misma licencia. Ver `LICENSE` y `NOTICE`.
