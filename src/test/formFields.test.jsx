import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NameField, PasswordField, PhoneField } from '../components/FormFields'

function Controlled({ Component, ...props }) {
  const [value, setValue] = useState('')
  return <Component value={value} onChange={setValue} {...props} />
}

describe('Phone Number field (7.1)', () => {
  it('ignores letters and symbols typed as "abc#"', async () => {
    const user = userEvent.setup()
    render(<Controlled Component={PhoneField} />)
    const input = screen.getByLabelText(/Phone Number/)

    await user.type(input, 'abc#')
    expect(input).toHaveValue('')

    await user.type(input, '09a17b')
    expect(input).toHaveValue('0917')
  })

  it('keeps only the digits of pasted text', async () => {
    const user = userEvent.setup()
    render(<Controlled Component={PhoneField} />)
    const input = screen.getByLabelText(/Phone Number/)

    await user.click(input)
    await user.paste('(0917) 123-4567 abc#')
    expect(input).toHaveValue('09171234567')
  })
})

describe('Password field (7.2)', () => {
  it('blocks pasting', async () => {
    const user = userEvent.setup()
    render(<Controlled Component={PasswordField} />)
    const input = screen.getByLabelText(/^Password/)

    await user.click(input)
    await user.paste('Secret123')
    expect(input).toHaveValue('')
  })

  it('blocks copy, cut, the right-click menu and the keyboard shortcuts', () => {
    render(<Controlled Component={PasswordField} />)
    const input = screen.getByLabelText(/^Password/)

    expect(fireEvent.copy(input)).toBe(false)
    expect(fireEvent.cut(input)).toBe(false)
    expect(fireEvent.contextMenu(input)).toBe(false)
    for (const key of ['c', 'x', 'v']) {
      expect(fireEvent.keyDown(input, { key, ctrlKey: true })).toBe(false)
      expect(fireEvent.keyDown(input, { key, metaKey: true })).toBe(false)
    }
  })

  it('has a show/hide eye toggle', async () => {
    const user = userEvent.setup()
    render(<Controlled Component={PasswordField} />)
    const input = screen.getByLabelText(/^Password/)

    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input).toHaveAttribute('type', 'password')
  })
})

describe('Name fields (7.3)', () => {
  it('stops at 75 characters and the counter shows 75/75', async () => {
    const user = userEvent.setup()
    render(<Controlled Component={NameField} label="First Name" />)
    const input = screen.getByLabelText(/First Name/)

    await user.type(input, 'x'.repeat(76))
    expect(input).toHaveValue('x'.repeat(75))
    expect(screen.getByText('75/75')).toBeInTheDocument()
  })

  it('accepts letters, numbers and special characters with a live counter', async () => {
    const user = userEvent.setup()
    render(<Controlled Component={NameField} label="First Name" />)
    const input = screen.getByLabelText(/First Name/)

    await user.type(input, 'Ma. José #2')
    expect(input).toHaveValue('Ma. José #2')
    expect(screen.getByText('11/75')).toBeInTheDocument()
  })
})
