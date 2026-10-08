export function normalizePhone(value: string | undefined | null): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.startsWith('55')) {
    const nationalNumber = digits.slice(2);
    if (nationalNumber.length === 10 || nationalNumber.length === 11) {
      return nationalNumber;
    }
  }
  return digits;
}

export function getPhoneVariants(value: string | undefined | null): string[] {
  const normalized = normalizePhone(value);
  if (!normalized) return [];

  const variants = [normalized];
  if (normalized.length === 10 || normalized.length === 11) {
    variants.push(`55${normalized}`);
  }
  return variants;
}