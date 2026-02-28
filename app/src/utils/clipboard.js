// Robust clipboard utility with fallback for environments where navigator.clipboard is unavailable
// Returns a Promise<boolean> indicating success
export async function copyToClipboard(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text ?? '');
      return true;
    }
  } catch (_) {
    // Fall through to fallback
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text ?? '';
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (_) {
    return false;
  }
}


