const ALLOWED_LENS_PARAM_KEYS = [
  "sph_right",
  "sph_left",
  "cyl_right",
  "cyl_left",
  "axis_right",
  "axis_left",
  "add_right",
  "add_left",
  "pd",
  "pupillary_distance",
  "note",
];

const NUMERIC_KEYS = ALLOWED_LENS_PARAM_KEYS.filter((k) => k !== "note");

function sanitizeLensParams(input) {
  if (input === undefined || input === null) return null;
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("lens_params phải là object");
  }

  const sanitized = {};

  for (const key of ALLOWED_LENS_PARAM_KEYS) {
    const rawValue = input[key];
    if (rawValue === undefined || rawValue === null || rawValue === "")
      continue;

    if (NUMERIC_KEYS.includes(key)) {
      const numericValue = Number(rawValue);
      if (Number.isNaN(numericValue)) {
        throw new Error(`lens_params.${key} phải là số`);
      }
      sanitized[key] = numericValue;
      continue;
    }

    if (key === "note") {
      sanitized.note = String(rawValue).trim();
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

module.exports = {
  ALLOWED_LENS_PARAM_KEYS,
  sanitizeLensParams,
};
