import { Fragment } from 'react'
import type { StorageEntry } from '../../shared/storageRegistry'

/**
 * Namnet i lagringstabellen: nyckelnamn som kod, ett per rad (Stripes två
 * cookies), och poster utan lagring (Turnstile, Besöksstatistik) som vanlig text.
 */
export function StorageName({ entry }: { entry: StorageEntry }) {
  if (entry.kind === 'ingen') return <span className="storage-name">{entry.name}</span>
  return (
    <code>
      {entry.name.split(', ').map((part, i) => (
        <Fragment key={part}>
          {i > 0 && <br />}
          {part}
        </Fragment>
      ))}
    </code>
  )
}
