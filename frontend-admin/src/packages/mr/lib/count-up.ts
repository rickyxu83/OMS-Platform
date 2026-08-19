import { useEffect, useRef, useState } from 'react'

export function countUpValue(target: number, progress: number) {
  const clamped = Math.min(1, Math.max(0, progress))
  return target * (1 - (1 - clamped) ** 3)
}

export function useCountUp(value: number | null | undefined, animationKey = 0, duration = 900) {
  const target = Number(value || 0)
  const targetRef = useRef(target)
  const hasValueRef = useRef(value !== null && value !== undefined)
  const activeKeyRef = useRef(animationKey)
  const [display, setDisplay] = useState(() => (
    animationKey > 0 && value !== null && value !== undefined && typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : target
  ))
  targetRef.current = target
  hasValueRef.current = value !== null && value !== undefined

  useEffect(() => {
    if (activeKeyRef.current === animationKey) setDisplay(target)
  }, [animationKey, target])

  useEffect(() => {
    activeKeyRef.current = animationKey
    const reduceMotion = typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!animationKey || !hasValueRef.current || reduceMotion) {
      setDisplay(targetRef.current)
      return
    }

    let frame = 0
    let startedAt = 0
    setDisplay(0)
    const tick = (time: number) => {
      if (!startedAt) startedAt = time
      const progress = Math.min(1, (time - startedAt) / duration)
      setDisplay(countUpValue(targetRef.current, progress))
      if (progress < 1) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [animationKey, duration])

  return display
}
