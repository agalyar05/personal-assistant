import * as db from "./db";

export const DEFAULT_GROCERY = "groceries";
export const DEFAULT_NOTES = "notes";

export function normalizeListName(name: string): string {
  let n = name.trim().toLowerCase();
  if (n.endsWith(" list")) n = n.slice(0, -5).trim();
  if (n.startsWith(".")) n = n.slice(1);
  return n;
}

const GROCERY_AISLES: Record<string, string[]> = {
  Produce: ["apple", "banana", "orange", "lettuce", "spinach", "tomato", "onion", "garlic", "potato", "carrot", "broccoli", "avocado", "lemon", "lime", "grape", "berry", "cucumber", "pepper", "celery", "mushroom", "fruit", "vegetable", "salad", "herbs", "cilantro", "basil"],
  Dairy: ["milk", "cheese", "yogurt", "butter", "cream", "egg", "eggs", "sour cream", "cottage"],
  Bakery: ["bread", "bagel", "muffin", "croissant", "tortilla", "bun", "roll", "pita"],
  "Meat & Seafood": ["chicken", "beef", "pork", "fish", "salmon", "shrimp", "turkey", "bacon", "sausage", "steak"],
  Frozen: ["frozen", "ice cream", "pizza"],
  Snacks: ["chips", "crackers", "cookies", "candy", "popcorn", "granola bar", "nuts"],
  Beverages: ["water", "juice", "soda", "coffee", "tea", "sparkling"],
  Pantry: ["rice", "pasta", "flour", "sugar", "oil", "salt", "pepper", "spice", "sauce", "beans", "cereal", "oat", "can", "soup", "peanut butter", "jam", "honey", "vinegar"],
  Household: ["paper towel", "toilet paper", "soap", "detergent", "trash bag", "foil", "wrap", "tissue"],
};

function aisleFor(item: string): string {
  const lower = item.toLowerCase();
  for (const [aisle, keywords] of Object.entries(GROCERY_AISLES)) {
    if (keywords.some((k) => lower.includes(k))) return aisle;
  }
  return "Other";
}

export function formatAddConfirmation(
  listName: string,
  added: string[],
  skipped: string[],
): string {
  const name = normalizeListName(listName);
  const label = listName.startsWith(".") ? listName : `.${name}`;

  const dupPhrase = (dupes: string[]) => {
    if (dupes.length === 1) return `you already have ${dupes[0]} on ${label}`;
    if (dupes.length === 2)
      return `you already have ${dupes[0]} and ${dupes[1]} on ${label}`;
    return `you already have ${dupes.slice(0, -1).join(", ")}, and ${dupes[dupes.length - 1]} on ${label}`;
  };

  if (!added.length) {
    if (skipped.length) return `${dupPhrase(skipped)} — nothing new to add.`;
    return "No items to add.";
  }

  let addedPhrase: string;
  if (added.length === 1) addedPhrase = `added ${added[0]}`;
  else if (added.length <= 3) addedPhrase = `added ${added.join(", ")}`;
  else
    addedPhrase = `added ${added.slice(0, 2).join(", ")} +${added.length - 2} more`;

  if (skipped.length) {
    return `${dupPhrase(skipped)}, but i'll add everything else — ${addedPhrase} ✨`;
  }
  return `got it — ${addedPhrase} to ${label} ✨`;
}

export async function addToList(
  listName: string,
  items: string[],
): Promise<string> {
  const name = normalizeListName(listName) || DEFAULT_GROCERY;
  const { added, skipped } = await db.addListItems(name, items);
  return formatAddConfirmation(`.${name}`, added.map((a) => a.text), skipped);
}

export async function getListParts(
  listName = "",
  opts?: { unassignedOnly?: boolean },
): Promise<string[]> {
  const name = normalizeListName(listName) || DEFAULT_GROCERY;
  let items = (await db.getListItems(name)).filter((i) => !i.checked);
  if (opts?.unassignedOnly) {
    items = items.filter((i) => i.difficulty === "unassigned");
  }
  if (!items.length) {
    return opts?.unassignedOnly
      ? [`Nothing unassigned on '.${name}' — it's all sorted! 🎉`]
      : [`Your '.${name}' list is empty.`];
  }

  if (name === DEFAULT_GROCERY) {
    const byAisle: Record<string, string[]> = {};
    for (const item of items) {
      const aisle = aisleFor(item.text);
      byAisle[aisle] ||= [];
      byAisle[aisle].push(item.text);
    }
    const emojis: Record<string, string> = {
      Produce: "🥬",
      Dairy: "🥛",
      Bakery: "🥖",
      "Meat & Seafood": "🍗",
      Frozen: "🧊",
      Snacks: "🍿",
      Beverages: "🥤",
      Pantry: "🥫",
      Household: "🧻",
      Other: "🛒",
    };
    const parts = ["Your .groceries list 🛒"];
    for (const aisle of [...Object.keys(GROCERY_AISLES), "Other"]) {
      if (!byAisle[aisle]) continue;
      parts.push(`${emojis[aisle] || "🛒"} ${aisle}`);
      for (const item of byAisle[aisle]) parts.push(`- ${item}`);
    }
    return parts;
  }

  return [
    opts?.unassignedOnly
      ? `Your '.${name}' unassigned list:`
      : `Your '.${name}' list:`,
    ...items.map((item, i) => `${i + 1}. ${item.text}`),
  ];
}

export function smsParts(parts: string[]): { smsParts: string[] } {
  return { smsParts: parts };
}
