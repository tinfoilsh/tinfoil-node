export async function getRouterAddress(): Promise<string> {
  const url = 'https://atc.tinfoil.sh/routers?platform=snp';
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch routers: ${response.status} ${response.statusText}`);
  }

  const routers: string[] = await response.json();

  if (routers.length === 0) {
    throw new Error('No routers found in the response');
  }

  return routers[Math.floor(Math.random() * routers.length)];
}
