export async function fetchApifyDataset(url: string): Promise<any[]> {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Dataset fetch failed (${res.status})`);
  }

  const data = await res.json();

  if (!Array.isArray(data)) {
    throw new Error('Dataset did not return array');
  }

  return data;
}
