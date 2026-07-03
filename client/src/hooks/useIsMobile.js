import useMediaQuery from '@mui/material/useMediaQuery';

// Matches MUI's `sm` breakpoint (600px) without needing a ThemeProvider.
// Single source of truth for the app's mobile cutoff.
export default function useIsMobile() {
  return useMediaQuery('(max-width:599.95px)');
}
