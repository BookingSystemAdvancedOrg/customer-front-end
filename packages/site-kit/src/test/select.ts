import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** Väljer ett alternativ i en rullista (Select): öppnar den och klickar alternativet. */
export async function pickOption(user: UserEvent, combobox: HTMLElement, option: string | RegExp) {
  await user.click(combobox)
  const list = await screen.findByRole('listbox')
  await user.click(within(list).getByRole('option', { name: option }))
}
