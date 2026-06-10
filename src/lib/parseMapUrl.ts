/**
 * Parse coordinates from various input formats (ported verbatim from Moedatech-App c-hub):
 * - Google Maps URLs (e.g. https://maps.google.com/...@24.7136,46.6753,...)
 * - Google Maps short links with q= param
 * - Raw "lat, lng" pairs
 */
export function parseCoordinatesFromInput(input: string): { lat: number; lng: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const atMatch = trimmed.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidCoords(lat, lng)) return { lat, lng };
  }

  const qMatch = trimmed.match(/[?&](?:q|query)=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (isValidCoords(lat, lng)) return { lat, lng };
  }

  const placeMatch = trimmed.match(/\/place\/[^/]*\/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (placeMatch) {
    const lat = parseFloat(placeMatch[1]);
    const lng = parseFloat(placeMatch[2]);
    if (isValidCoords(lat, lng)) return { lat, lng };
  }

  const rawMatch = trimmed.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
  if (rawMatch) {
    const lat = parseFloat(rawMatch[1]);
    const lng = parseFloat(rawMatch[2]);
    if (isValidCoords(lat, lng)) return { lat, lng };
  }

  return null;
}

function isValidCoords(lat: number, lng: number): boolean {
  return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
