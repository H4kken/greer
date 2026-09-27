// docker-compose.yml passes optional settings as `${VAR:-}`, so an unset
// variable arrives as an empty string. Libraries treat "" as a value (e.g.
// @ai-sdk/openai reads OPENAI_BASE_URL when imported and rejects ""), so
// empty variables are removed before anything else runs.
export function dropEmptyEnv(
  env: Record<string, string | undefined> = process.env,
): void {
  for (const key of Object.keys(env)) {
    if (env[key] === "") delete env[key];
  }
}
