export function resolveApifyInput(input: string): string {
  const value = input.trim();

  if (!value) throw new Error('Empty dataset input');

  // full URL already
  if (value.startsWith('http')) {
    return value;
  }

  // bare dataset ID
  return `https://api.apify.com/v2/datasets/${value}/items`;
}
