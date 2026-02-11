"use client"

import { createContext, useContext, useEffect, useState } from "react"
import type React from "react"
import { getUiLanguage, setUiLanguage } from "@/lib/ui-language"
import { translations, type Language } from "@/workspaces/flow/next/lib/translations"

type LanguageContextType = {
    language: Language
    setLanguage: (lang: Language) => void
    t: (key: keyof typeof translations.en) => string
}

const LanguageContext = createContext<LanguageContextType | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguage] = useState<Language>(() => getUiLanguage())

    useEffect(() => {
        const syncFromGlobal = () => {
            setLanguage(getUiLanguage())
        }

        syncFromGlobal()
        window.addEventListener("ui-language-changed", syncFromGlobal as any)
        return () =>
            window.removeEventListener(
                "ui-language-changed",
                syncFromGlobal as any,
            )
    }, [])

    const handleSetLanguage = (lang: Language) => {
        setLanguage(lang)
        setUiLanguage(lang)
    }

    const t = (key: keyof typeof translations.en) => {
        return translations[language][key] || key
    }

    return (
        <LanguageContext.Provider
            value={{ language, setLanguage: handleSetLanguage, t }}
        >
            {children}
        </LanguageContext.Provider>
    )
}

export const useLanguage = () => {
    const context = useContext(LanguageContext)
    if (!context) {
        throw new Error("useLanguage must be used within a LanguageProvider")
    }
    return context
}
