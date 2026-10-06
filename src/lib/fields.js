export const STANDARD_FIELDS = [
  { key: "firstName", label: "First name", aliases: ["first name", "firstname", "first", "fname", "given name"] },
  { key: "lastName", label: "Last name", aliases: ["last name", "lastname", "last", "lname", "surname", "family name"] },
  { key: "name", label: "Full name", aliases: ["full name", "fullname", "name", "contact name", "contact"] },
  { key: "email", label: "Email", aliases: ["email", "email address", "e mail", "mail", "emailaddress"] },
  {
    key: "phone",
    label: "Phone",
    aliases: ["phone", "phone number", "mobile", "mobile number", "mobile phone", "cell", "cell phone", "telephone", "tel", "contact number", "phonenumber"],
  },
  { key: "companyName", label: "Company", aliases: ["company", "company name", "business", "business name", "organization", "organisation"] },
  { key: "address1", label: "Street address", aliases: ["address", "address1", "address 1", "street", "street address", "address line 1"] },
  { key: "city", label: "City", aliases: ["city", "town", "suburb"] },
  { key: "state", label: "State", aliases: ["state", "province", "region", "county"] },
  { key: "postalCode", label: "Postal code", aliases: ["postal code", "postcode", "post code", "zip", "zip code", "zipcode"] },
  { key: "country", label: "Country", aliases: ["country", "country code"] },
  { key: "website", label: "Website", aliases: ["website", "web site", "url", "web"] },
  { key: "timezone", label: "Timezone", aliases: ["timezone", "time zone"] },
  { key: "dateOfBirth", label: "Date of birth", aliases: ["date of birth", "dob", "birthday", "birth date", "birthdate"] },
  { key: "source", label: "Source", aliases: ["source", "lead source"] },
];

export const MULTI_VALUE_TYPES = new Set(["MULTIPLE_OPTIONS", "CHECKBOX"]);

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/^contact\./, "")
    .replace(/[_\-.\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Mapping values: "" (skip), "std:<key>" or "cf:<customFieldId>". */
export function guessMapping(headers, customFields) {
  const lookup = new Map();
  for (const f of STANDARD_FIELDS) for (const a of [f.label, ...f.aliases]) lookup.set(norm(a), `std:${f.key}`);
  for (const cf of customFields) {
    for (const a of [cf.name, cf.fieldKey]) {
      if (a && !lookup.has(norm(a))) lookup.set(norm(a), `cf:${cf.id}`);
    }
  }

  const used = new Set();
  const mapping = {};
  for (const h of headers) {
    const target = lookup.get(norm(h)) ?? "";
    if (target && !used.has(target)) {
      mapping[h] = target;
      used.add(target);
    } else {
      mapping[h] = "";
    }
  }
  return mapping;
}

export function targetLabel(target, customFieldsById) {
  if (!target) return "";
  const [kind, id] = target.split(/:(.*)/s);
  if (kind === "std") return STANDARD_FIELDS.find((f) => f.key === id)?.label ?? id;
  return customFieldsById[id]?.name ?? id;
}
