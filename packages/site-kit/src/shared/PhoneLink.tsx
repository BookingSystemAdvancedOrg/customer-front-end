import type { AnchorHTMLAttributes } from 'react'
import { formatPhoneNational, phoneHref } from './phone'

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'> & {
  /** Numret som det sparas, helst E.164 ("+46701740605"). */
  phone: string
}

/** Ett klickbart nummer: visas "070-174 06 05", ringer "tel:+46701740605". */
export function PhoneLink({ phone, ...rest }: Props) {
  return (
    <a href={phoneHref(phone)} {...rest}>
      {formatPhoneNational(phone)}
    </a>
  )
}
