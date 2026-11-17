// shared SQL helpers for the repositories

// makes %, _ and \ in user input match literally instead of acting as LIKE wildcards.
// Use with `LIKE ? ESCAPE '\'`; the value is still passed as a bound parameter.
export function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
