import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { config } from '../config'
import { salon } from '../content/salon'

/**
 * The salon details Leyah keeps on her profile (phone, payment account name, Facebook and Instagram, bio, her photo),
 * loaded once and shared by every page that shows them. Until they load, or for anything she left empty, the social
 * links fall back to content/salon.js; the phone, bio and photo are simply not shown.
 */
const SalonContext = createContext(null)

/** "09171234567" → "0917 123 4567" */
export const formatPhone = (phone) => (phone && /^09\d{9}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone ?? '')

const photoSrc = (profile) => {
  if (profile?.photoDataUrl) return profile.photoDataUrl // the test-only backend sends the image itself
  if (!profile?.photoUrl) return null
  return `${config.apiBaseUrl.replace(/\/$/, '')}${profile.photoUrl.replace(/^\/api/, '')}`
}

function describe(profile) {
  return {
    phone: profile?.phone ?? null,
    paymentAccountName: profile?.paymentAccountName ?? null,
    facebookUrl: profile?.facebookUrl ?? salon.social.facebook,
    instagramUrl: profile?.instagramUrl ?? salon.social.instagram,
    instagramHandle: profile?.instagramHandle ?? salon.social.instagramHandle,
    bio: profile?.bio ?? null,
    photo: photoSrc(profile),
  }
}

const fallback = { ...describe(null), loaded: false, refresh: () => {}, replace: () => {} }

export function SalonProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const refresh = useCallback(() => api.salon.get().then(setProfile).catch(() => {}).finally(() => setLoaded(true)), [])
  useEffect(() => { refresh() }, [refresh])
  // After Leyah saves, the page shows her new details at once, without another request.
  const value = useMemo(() => ({ ...describe(profile), loaded, refresh, replace: setProfile }), [profile, loaded, refresh])
  return <SalonContext.Provider value={value}>{children}</SalonContext.Provider>
}

export const useSalon = () => useContext(SalonContext) ?? fallback
