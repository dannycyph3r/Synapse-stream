"use client";

import { useEffect } from "react";
import { applyDocumentPreferences, useStoredData } from "@/lib/storage/store";

/** Keeps <html> data attributes in step with stored theme and motion settings. */
export function PreferenceSync() {
  const data = useStoredData();
  const settings = data?.settings;
  useEffect(() => {
    if (settings) applyDocumentPreferences(settings);
  }, [settings]);
  return null;
}
