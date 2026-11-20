import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { allergenText, optionsOre, validPicks } from '../meny/menuApi'
import type { PublicMenuItem } from '../meny/menuApi'
import { kronor } from './orderApi'
import type { OptionPick } from './orderApi'

/**
 * Tillvalen för en rätt innan den läggs i varukorgen: ett val i en grupp
 * med "Ett val" (radioknappar, med "Inget" när gruppen är valfri), annars
 * kryssrutor upp till gruppens max.
 * Priset visas med tilläggen; servern räknar om det när beställningen görs.
 */
export function OptionPicker({
  dish,
  onAdd,
  onClose,
}: {
  dish: PublicMenuItem
  onAdd: (picks: OptionPick[]) => void
  onClose: () => void
}) {
  const titleId = useId()
  const groups = dish.options ?? []
  // Förvalt: första valet i en grupp som krävs och bara tillåter ett.
  const [picks, setPicks] = useState<OptionPick[]>(() =>
    groups.filter((g) => g.required && g.maxChoices === 1 && g.choices[0])
      .map((g) => ({ group: g.name, choice: g.choices[0].name })),
  )
  const ok = validPicks(dish, picks)
  const unit = Math.round(dish.price * 100) + optionsOre(dish, picks)
  const allergens = allergenText(dish.allergens)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = prev
    }
  }, [onClose])

  function clearGroup(group: string) {
    setPicks((prev) => prev.filter((p) => p.group !== group))
  }

  function toggle(group: string, choice: string, single: boolean, max: number) {
    setPicks((prev) => {
      const has = prev.some((p) => p.group === group && p.choice === choice)
      if (single) return [...prev.filter((p) => p.group !== group), { group, choice }]
      if (has) return prev.filter((p) => !(p.group === group && p.choice === choice))
      if (prev.filter((p) => p.group === group).length >= max) return prev
      return [...prev, { group, choice }]
    })
  }

  return createPortal(
    <div className="opening-hours-modal-root option-picker-root">
      <button type="button" className="opening-hours-modal-backdrop" aria-label="Stäng" onClick={onClose} />
      <div className="opening-hours-modal-panel option-picker" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="opening-hours-modal-header">
          <h2 id={titleId} className="opening-hours-modal-heading" translate="no">{dish.name}</h2>
          <button type="button" className="opening-hours-modal-close" onClick={onClose} aria-label="Stäng">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {allergens && <p className="dish-allergens">{allergens}</p>}
        {groups.map((g) => {
          const single = g.maxChoices === 1
          const mine = picks.filter((p) => p.group === g.name)
          return (
            <fieldset key={g.name} className="option-group">
              <legend>
                {g.name}
                <span className="option-group-rule">
                  {g.required ? 'Krävs' : 'Valfritt'}
                  {!single && `, välj upp till ${g.maxChoices}`}
                </span>
              </legend>
              {single && !g.required && (
                <label className="option-choice">
                  <input
                    type="radio"
                    name={`${titleId}-${g.name}`}
                    checked={mine.length === 0}
                    onChange={() => clearGroup(g.name)}
                  />
                  <span className="option-choice-name">Inget</span>
                </label>
              )}
              {g.choices.map((c) => {
                const checked = mine.some((p) => p.choice === c.name)
                return (
                  <label key={c.name} className="option-choice">
                    <input
                      type={single ? 'radio' : 'checkbox'}
                      name={`${titleId}-${g.name}`}
                      checked={checked}
                      disabled={!single && !checked && mine.length >= g.maxChoices}
                      onChange={() => toggle(g.name, c.name, single, g.maxChoices)}
                    />
                    <span className="option-choice-name">{c.name}</span>
                    {c.price > 0 && <span className="option-choice-price">+{kronor(Math.round(c.price * 100))}</span>}
                  </label>
                )
              })}
            </fieldset>
          )
        })}
        <button type="button" className="btn-primary option-picker-add" disabled={!ok} onClick={() => onAdd(picks)}>
          Lägg till · {kronor(unit)}
        </button>
      </div>
    </div>,
    document.body,
  )
}
