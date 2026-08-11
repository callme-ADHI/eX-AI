import React, { useEffect } from 'react';
import { useStorage } from './hooks/useStorage';
import { KEYS } from '../shared/storage';
import { DEFAULT_SETTINGS } from '../shared/defaults';
import type { AppSettings } from '../shared/types';

import Clock from './components/Clock/Clock';
import AIDock from './components/AIDock/AIDock';
import SearchBar from './components/SearchBar/SearchBar';
import Dock from './components/Dock/Dock';
import ProductivityCard from './components/ProductivityCard/ProductivityCard';
import TabIntelCard from './components/TabIntelCard/TabIntelCard';
import SettingsPanel from './components/Settings/SettingsPanel';
import AevoarxLogo from './components/AevoarxLogo/AevoarxLogo';

import styles from './App.module.css';

export default function App() {
  const [settings] = useStorage<AppSettings>(KEYS.SETTINGS, DEFAULT_SETTINGS);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme ?? 'platinum');
  }, [settings.theme]);

  return (
    <div className={styles.root}>
      {/* ── Large clock — left center ───────────── */}
      <div className={styles.clockArea}>
        <Clock settings={settings} />
      </div>

      {/* ── Search bar — top right ──────────────── */}
      <div className={styles.searchArea}>
        <SearchBar />
      </div>

      {/* ── Productivity + Tab cards side-by-side ── */}
      <div className={styles.subSearchRow}>
        <ProductivityCard />
        <TabIntelCard />
      </div>

      {/* ── AI Dock — left edge triggered ────────── */}
      <AIDock />

      {/* ── Dock — bottom center ────────────────── */}
      <Dock />

      {/* ── Brand logo — top-right corner ────────── */}
      <div className={styles.logoArea}>
        <AevoarxLogo />
      </div>

      {/* ── Settings gear ───────────────────────── */}
      <div className={styles.settingsArea}>
        <SettingsPanel />
      </div>
    </div>
  );
}
