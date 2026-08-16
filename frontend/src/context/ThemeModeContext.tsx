import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { storageKeyPrefix, brandGreen, brandGreenDark } from '../config/gymConfig';

type Mode = 'light' | 'dark';

const STORAGE_KEY = `${storageKeyPrefix}_theme_mode`;

interface ThemeModeContextValue {
  mode: Mode;
  toggleMode: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- hook colocalisé avec son Provider, comme le reste du contexte
export const useThemeMode = (): ThemeModeContextValue => {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode doit être utilisé dans ThemeModeProvider');
  return ctx;
};

const getInitialMode = (): Mode => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const ThemeModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<Mode>(getInitialMode);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggleMode = () => setMode((prev) => (prev === 'light' ? 'dark' : 'light'));

  // ✅ Charte du site vitrine (www.blocabrac.fr) : vert principal + sa variante
  // foncée (dégradés/hover du site), police "Dosis" (self-hébergée, voir
  // src/styles/fonts.css) en lieu et place du Roboto/bleu par défaut de MUI —
  // même palette/police en clair et en sombre, seul le fond/texte change avec
  // `mode` (comportement MUI standard, inchangé).
  const theme = useMemo(() => createTheme({
    palette: {
      mode,
      primary: { main: brandGreen, dark: brandGreenDark },
    },
    typography: {
      fontFamily: '"Dosis", "Helvetica Neue", Arial, sans-serif',
    },
  }), [mode]);

  const value = useMemo(() => ({ mode, toggleMode }), [mode]);

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
};
