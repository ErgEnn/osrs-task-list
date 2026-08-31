import { useEffect } from 'react';
import { startCrossTabSync } from './crossTab';

/**
 * Keep this tab in step with the app's other tabs for as long as it is mounted.
 * The listeners themselves live in {@link startCrossTabSync}, free of React.
 */
export function useCrossTabSync() {
  useEffect(() => startCrossTabSync(), []);
}
