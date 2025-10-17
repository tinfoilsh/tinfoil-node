import { TINFOIL_CONFIG } from "./config";

/**
 * Router utilities for fetching available Tinfoil routers
 */

/**
 * Fetches the list of available routers from the ATC API
 * and returns a randomly selected address.
 * 
 * @returns Promise<string> A randomly selected router address
 * @throws Error if no routers are found or if the request fails
 */
export async function fetchRouter(): Promise<string> {
  const routersUrl = TINFOIL_CONFIG.ATC_API_URL;
  
  try {
    const response = await fetch(routersUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch routers: ${response.status} ${response.statusText}`);
    }
    
    const routers: string[] = await response.json();
    
    if (!Array.isArray(routers) || routers.length === 0) {
      throw new Error("No routers found in the response");
    }
    
    // Return a randomly selected router
    const randomIndex = Math.floor(Math.random() * routers.length);
    return routers[randomIndex];
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch router: ${error.message}`);
    }
    throw new Error("Failed to fetch router: Unknown error");
  }
}
