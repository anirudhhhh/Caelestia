import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Triggers smooth scrolling and a visual highlight pulse on a DOM element by section ID.
 */
export function triggerSectionHighlight(sectionId: string): boolean {
  if (!sectionId) return false;
  
  // Clean up any leading '#' or 'section='
  const cleanId = sectionId.replace(/^[#?]/, '').replace(/^section=/, '');
  
  // Try finding element by ID or data-section attribute
  let el = document.getElementById(cleanId);
  if (!el) {
    el = document.querySelector(`[data-section="${cleanId}"]`) as HTMLElement;
  }

  if (el) {
    // Remove class first if already active to retrigger animation
    el.classList.remove('highlight-section-active');
    
    // Force browser reflow
    void el.offsetWidth;

    // Scroll into view with margin offset
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-section-active');

    // Remove animation class after pulse completes
    setTimeout(() => {
      if (el) {
        el.classList.remove('highlight-section-active');
      }
    }, 4000);

    return true;
  }
  return false;
}

/**
 * React hook that automatically monitors URL query params, hashes, and navigation state
 * to scroll to and highlight sections on mount and route changes.
 */
export function useSectionHighlight() {
  const location = useLocation();

  useEffect(() => {
    // 1. Check URL query parameters (e.g. ?section=policy-pii-matrix)
    const params = new URLSearchParams(location.search);
    const sectionParam = params.get('section') || params.get('highlight');

    // 2. Check URL hash (e.g. #policy-pii-matrix)
    const hash = location.hash ? location.hash.substring(1) : null;

    // 3. Check React Router location state
    const stateSection = (location.state as any)?.highlightSection;

    const targetSection = sectionParam || hash || stateSection;

    if (targetSection) {
      // Delay slightly for component DOM rendering
      const timeoutId = setTimeout(() => {
        triggerSectionHighlight(targetSection);
      }, 180);

      return () => clearTimeout(timeoutId);
    }
  }, [location.pathname, location.search, location.hash, location.state]);
}
