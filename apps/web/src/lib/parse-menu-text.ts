const PRICE_TOKEN_RE = /^\d[\d.,]*[kK]?$/;

function normalizePriceToken(token: string): string {
  const kMultiplierMatch = /^(\d[\d.,]*)[kK]$/.exec(token);
  if (kMultiplierMatch) {
    return String(Number(kMultiplierMatch[1].replace(/[.,]/g, "")) * 1000);
  }

  const thousandsMatch = /^(\d+)[.,](\d{3})$/.exec(token);
  if (thousandsMatch) {
    return `${thousandsMatch[1]}${thousandsMatch[2]}`;
  }

  const decimalMatch = /^(\d+)[.,](\d{1,2})$/.exec(token);
  if (decimalMatch) {
    return `${decimalMatch[1]}.${decimalMatch[2]}`;
  }

  return token;
}

export function parseMenuText(rawText: string): { name: string; price: string }[] {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const words = line.split(/\s+/);
      const lastWord = words[words.length - 1];

      if (words.length > 1 && PRICE_TOKEN_RE.test(lastWord)) {
        return {
          name: words.slice(0, -1).join(" "),
          price: normalizePriceToken(lastWord),
        };
      }

      return { name: line, price: "" };
    });
}
