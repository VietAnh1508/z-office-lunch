const formatter = new Intl.NumberFormat("vi-VN");

export function formatPrice(price: string): string {
  return formatter.format(Number(price));
}
