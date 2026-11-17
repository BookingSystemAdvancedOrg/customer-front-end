import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api'
import { billErrorMessage, billFromError, forgetPayment, LINK_GONE, recallPayment, rememberPayment } from './notanApi'

beforeEach(() => sessionStorage.clear())

describe('notanApi', () => {
  it('says who acts for every refusal', () => {
    expect(billErrorMessage(new ApiError(404, 'not found'))).toBe(LINK_GONE)
    expect(billErrorMessage(new ApiError(409, 'bill_being_paid'))).toMatch(/fråga personalen/)
    expect(billErrorMessage(new ApiError(503, 'order service unavailable'))).toBe(
      'Betalningen fungerar inte just nu (Booqys fel). Betala hos personalen.')
    expect(billErrorMessage(new TypeError('offline'))).toBe('Något gick fel. Försök igen.')
  })

  it('takes the fresh bill from bill_changed', () => {
    const fresh = { status: 'open', amount: 52000, count: 3, orders: [], vat: [] }
    expect(billFromError(new ApiError(409, 'bill_changed', { error: 'bill_changed', bill: fresh }))).toEqual(fresh)
    expect(billFromError(new ApiError(409, 'bill_paid', { error: 'bill_paid' }))).toBeNull()
  })

  it('remembers a started payment per location until it is forgotten', () => {
    rememberPayment('loc-1', { billId: 'b1', billToken: 't1', amount: 45000 })
    expect(recallPayment('loc-1')).toEqual({ billId: 'b1', billToken: 't1', amount: 45000 })
    expect(recallPayment('loc-2')).toBeNull()
    forgetPayment('loc-1')
    expect(recallPayment('loc-1')).toBeNull()
    sessionStorage.setItem('table-bill-pay:loc-1', '{broken')
    expect(recallPayment('loc-1')).toBeNull()
  })
})
