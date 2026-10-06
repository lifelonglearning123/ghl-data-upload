import { getCountries, parsePhoneNumberFromString } from "libphonenumber-js";
import { MULTI_VALUE_TYPES } from "./fields.js";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export const COUNTRIES = getCountries()
  .map((code) => ({ code, name: regionNames.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name));

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));
const COUNTRY_BY_NAME = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c.code]));
for (const [alias, code] of [
  ["usa", "US"], ["united states of america", "US"], ["america", "US"],
  ["uk", "GB"], ["england", "GB"], ["scotland", "GB"], ["wales", "GB"], ["great britain", "GB"],
  ["uae", "AE"], ["holland", "NL"],
]) {
  COUNTRY_BY_NAME.set(alias, code);
}

export function defaultCountry() {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (region && COUNTRY_CODES.has(region)) return region;
  } catch {
    // fall through
  }
  return "US";
}

function toCountryCode(value) {
  const upper = value.toUpperCase();
  if (COUNTRY_CODES.has(upper)) return upper;
  return COUNTRY_BY_NAME.get(value.toLowerCase()) ?? value;
}

function formatPhone(value, country) {
  const cleaned = value.replace(/^'+/, "");
  const parsed = parsePhoneNumberFromString(cleaned, country);
  if (parsed?.isValid()) return parsed.number;
  // Numbers like "61412345678" (country code without "+")
  const withPlus = parsePhoneNumberFromString(`+${cleaned.replace(/\D/g, "")}`);
  if (withPlus?.isValid()) return withPlus.number;
  return cleaned;
}

/**
 * Turn one spreadsheet row into a GHL upsert payload.
 * Returns { data, error } — error is set when the row can't be imported.
 */
export function buildContact(row, mapping, customFieldsById, country) {
  const data = {};
  const customFields = [];

  for (const [column, target] of Object.entries(mapping)) {
    if (!target) continue;
    const value = String(row[column] ?? "").trim();
    if (!value) continue;

    const [kind, id] = target.split(/:(.*)/s);
    if (kind === "std") {
      if (id === "phone") data.phone = formatPhone(value, country);
      else if (id === "email") data.email = value.toLowerCase();
      else if (id === "country") data.country = toCountryCode(value);
      else data[id] = value;
    } else {
      const field = customFieldsById[id];
      const fieldValue = MULTI_VALUE_TYPES.has(field?.dataType)
        ? value.split(/[,;|]/).map((v) => v.trim()).filter(Boolean)
        : value;
      customFields.push({ id, field_value: fieldValue });
    }
  }

  if (customFields.length) data.customFields = customFields;
  if (!data.email && !data.phone) return { data, error: "Missing both email and phone" };
  return { data, error: null };
}
