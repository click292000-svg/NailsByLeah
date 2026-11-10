import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NameField, PasswordField, PhoneField } from '../components/FormFields'
import { PHONE_MESSAGES, validatePhone } from '../validation/rules'

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
    expect(screen.getByText('Letters, spaces and symbols were removed from the pasted number.')).toBeInTheDocument()
  })

  it('stops typing at 11 digits and shows the digit count', async () => {
    const user = userEvent.setup()
    render(<Controlled Component={PhoneField} />)
    const input = screen.getByLabelText(/Phone Number/)

    await user.type(input, '091712345678')
    expect(input).toHaveValue('09171234567')
    expect(screen.getByText('11/11 digits')).toBeInTheDocument()
    expect(screen.getByText(/Phone numbers have exactly 11 digits/)).toBeInTheDocument()
  })

  it('takes +63 numbers, typed or pasted with spaces', async () => {
    const user = userEvent.setup()
    render(<Controlled Component={PhoneField} />)
    const input = screen.getByLabelText(/Phone Number/)

    await user.click(input)
    await user.paste('+63 917 123 4567')
    expect(input).toHaveValue('+639171234567')
    expect(screen.getByText('11/11 digits')).toBeInTheDocument()
    expect(validatePhone('+639171234567')).toBeNull()

    await user.clear(input)
    await user.type(input, '+6391712345678')
    expect(input).toHaveValue('+639171234567') // stops at 13 characters
  })

  it('keeps a pasted number that is too long, so it is rejected instead of cut off', async () => {
    const user = userEvent.setup()
    render(<Controlled Component={PhoneField} />)
    const input = screen.getByLabelText(/Phone Number/)

    await user.click(input)
    await user.paste('0917 123 45678')
    expect(input).toHaveValue('091712345678')
    expect(validatePhone('091712345678')).toBe(PHONE_MESSAGES.tooLong)
  })
})

describe('Phone Number rule', () => {
  it.each([
    ['09171234567', null],
    ['', PHONE_MESSAGES.required],
    ['0917-123-4567', PHONE_MESSAGES.digitsOnly],
    ['0917abc4567', PHONE_MESSAGES.digitsOnly],
    ['0917123456', PHONE_MESSAGES.tooShort],
    ['091712345678', PHONE_MESSAGES.tooLong],
    ['+639171234567', null],
    ['08171234567', PHONE_MESSAGES.notMobile],
    ['639171234567', PHONE_MESSAGES.notMobile],
    ['+63917123456', PHONE_MESSAGES.tooShort],
  ])('"%s" → %s', (value, message) => expect(validatePhone(value)).toBe(message))
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
