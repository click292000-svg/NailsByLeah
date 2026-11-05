import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, renderApp, signIn } from './helpers'

async function openPicker() {
  const user = userEvent.setup()
  await signIn(ADMIN)
  renderApp('/admin/schedule')
  await user.click(await screen.findByRole('button', { name: /^Closing time: 9:00 PM/ }))
  return { user, picker: screen.getByRole('dialog', { name: 'Closing time' }) }
}

describe('Closing time picker', () => {
  it('groups the times and marks the current one', async () => {
    const { picker } = await openPicker()

    const afternoon = within(picker).getByRole('group', { name: 'Afternoon' })
    const evening = within(picker).getByRole('group', { name: 'Evening' })
    expect(within(afternoon).getByRole('button', { name: '12:00 PM' })).toBeInTheDocument()
    expect(within(evening).getByRole('button', { name: '11:30 PM' })).toBeInTheDocument()
    const current = within(evening).getByRole('button', { name: '9:00 PM' })
    expect(current).toHaveAttribute('aria-pressed', 'true')
    expect(current).toHaveFocus()
  })

  it('saves the chosen time only after Save is pressed', async () => {
    const { user, picker } = await openPicker()
    const save = screen.getByRole('button', { name: 'Save closing time' })
    expect(save).toBeDisabled()

    await user.click(within(picker).getByRole('button', { name: '8:00 PM' }))

    expect(screen.queryByRole('dialog', { name: 'Closing time' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Closing time: 8:00 PM/ })).toHaveFocus()
    expect(save).toBeEnabled()

    await user.click(save)
    expect(await screen.findByText('Closing time set to 8:00 PM.')).toBeInTheDocument()
    expect(save).toBeDisabled()
  })

  it('works with the keyboard', async () => {
    const { user, picker } = await openPicker()

    await user.keyboard('{ArrowRight}')
    expect(within(picker).getByRole('button', { name: '9:30 PM' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(within(picker).getByRole('button', { name: '8:00 PM' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(within(picker).getByRole('button', { name: '12:00 PM' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Closing time' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Closing time: 9:00 PM/ })).toHaveFocus()
  })

  it('closes without changing anything when clicking outside', async () => {
    const { user } = await openPicker()

    await user.click(document.querySelector('main'))

    expect(screen.queryByRole('dialog', { name: 'Closing time' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Save closing time' })).toBeDisabled()
  })
})
