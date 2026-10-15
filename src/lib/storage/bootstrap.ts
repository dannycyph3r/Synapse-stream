import { LEGACY_STORAGE_KEY, STORAGE_KEY } from "./schema";

/**
 * Inline script for <head>. Applies stored theme and motion preferences before
 * first paint, so a player who chose dark mode never sees a light flash.
 */
export const PREFERENCES_BOOTSTRAP = `(function(){try{var d=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||localStorage.getItem(${JSON.stringify(
  LEGACY_STORAGE_KEY,
)})||"{}");var s=d&&d.settings||{};var r=document.documentElement;if(s.theme==="light"||s.theme==="dark")r.setAttribute("data-theme",s.theme);if(s.motion==="reduce"||s.motion==="allow")r.setAttribute("data-motion",s.motion);}catch(e){}})();`;
