const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
const UNKNOWN_LANGUAGE_VALUES = new Set(["", "unknown", "und", "root", "zxx", "mul"]);

function primaryLanguageCode(value) {
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    return new Intl.Locale(canonical).language.toLowerCase();
  } catch {
    return "";
  }
}

// Expand a language code, tag, or English name into comparable tokens so
// "en", "eng", "en-US", and "English" all match each other, while substring
// collisions such as "es" inside "Chinese" do not.
export function languageTokens(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (UNKNOWN_LANGUAGE_VALUES.has(raw)) return [];

  const tokens = new Set([raw]);
  const code = primaryLanguageCode(raw);
  if (code && !UNKNOWN_LANGUAGE_VALUES.has(code)) {
    tokens.add(code);
    try {
      const name = displayNames.of(code);
      if (name && name.toLowerCase() !== code) tokens.add(name.toLowerCase());
    } catch {
      // Not a recognized language code; the raw value still matches exactly.
    }
  }
  return [...tokens];
}

export function languagesMatch(preference, values) {
  const preferenceTokens = new Set(languageTokens(preference));
  if (!preferenceTokens.size) return false;
  return values.some((value) =>
    languageTokens(value).some((token) => preferenceTokens.has(token))
  );
}

export function isUnknownLanguage(values) {
  return values.every((value) => !languageTokens(value).length);
}
