import { useEffect, useState } from "react";
import { getUiLanguage, type UiLanguage } from "@/lib/ui-language";

export function useUiLanguage() {
  const [uiLang, setUiLang] = useState<UiLanguage>(() => getUiLanguage());

  useEffect(() => {
    const onLang = () => setUiLang(getUiLanguage());
    window.addEventListener("ui-language-changed", onLang as any);
    return () => window.removeEventListener("ui-language-changed", onLang as any);
  }, []);

  return uiLang;
}

