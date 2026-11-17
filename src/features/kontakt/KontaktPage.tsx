import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { PhoneLink, Select, useLocationInfo, useSite } from '@booqy/site-kit'
import { Button } from '@booqy/brand'

const SUBJECT_OPTIONS = [
  { value: 'rekommendation', label: 'Rekommendation' },
  { value: 'klagomal', label: 'Klagomål' },
  { value: 'forsaljare', label: 'Försäljare' },
  { value: 'ovrigt', label: 'Övrigt' },
]

/**
 * Kontakt. Det finns ingen meddelande-endpoint: formuläret öppnar ett
 * mailto:-utkast i besökarens e-postklient, till den valda platsens (eller
 * restaurangens) e-postadress från GET /site-config. Utan e-postprogram
 * händer inget synligt, så efter klicket visas adressen med en kopieringsknapp.
 */
export default function KontaktPage() {
  const { email, phone, address } = useLocationInfo()
  const { config } = useSite()
  const [name, setName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [opened, setOpened] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const subjectLabel = useMemo(
    () => SUBJECT_OPTIONS.find((opt) => opt.value === subject)?.label ?? subject,
    [subject],
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const mailSubject = `Kontakt ${config.tenant.name} - ${subjectLabel}`
    const mailBody = `Namn: ${name}\nE-post: ${contactEmail}\nÄmne: ${subjectLabel}\n\n${message}`
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`
    setOpened(true)
  }

  function copyAddress() {
    const fail = () => {
      setCopied(false)
      setCopyFailed(true)
    }
    if (!navigator.clipboard?.writeText) return fail()
    navigator.clipboard.writeText(email).then(() => {
      setCopyFailed(false)
      setCopied(true)
    }, fail)
  }

  return (
    <>
      <section className="photo-hero">
        <p className="hero-kicker">Hör av dig</p>
        <h1>Kontakt</h1>
        <p className="hero-sub">Skriv ditt meddelande här, så öppnas det i ditt e-postprogram.</p>
        {(phone || address) && (
          <p className="hero-sub">
            {address}
            {address && phone && ' · '}
            {phone && <PhoneLink phone={phone} />}
          </p>
        )}
      </section>

      {!email && (
        <p className="notice" role="status">
          {phone ? <>Ring oss på <PhoneLink phone={phone} />.</> : 'Kontaktuppgifter saknas just nu.'}
        </p>
      )}

      {email && (
      // Pilot för @booqy/brand: knappen är märkets Button i restaurangtemat, så den
      // får restaurangens färg (--tenant-*) i stället för Booqys espresso.
      <form className="contact-form" data-bq-theme="restaurant" onSubmit={handleSubmit}>
        <div className="contact-form-field">
          <label htmlFor="kontakt-name">Namn</label>
          <input
            id="kontakt-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="contact-form-field">
          <label htmlFor="kontakt-email">E-post</label>
          <input
            id="kontakt-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>

        <div className="contact-form-field">
          <label htmlFor="kontakt-subject">Ämne</label>
          <Select
            id="kontakt-subject"
            name="subject"
            required
            value={subject}
            onChange={setSubject}
            placeholder="Välj ämne"
            options={SUBJECT_OPTIONS}
          />
        </div>

        <div className="contact-form-field">
          <label htmlFor="kontakt-message">Meddelande</label>
          <textarea
            id="kontakt-message"
            name="message"
            required
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <Button type="submit" variant="primary" wide>
          Öppna i e-postprogrammet
        </Button>
        {/* Live-regionen finns alltid, så skärmläsare läser upp texten när den fylls. */}
        <p className="contact-form-status" role="status">
          {opened && (
            <>
              Öppnades inget? Mejla oss på <a href={`mailto:${email}`}>{email}</a>.{' '}
              <Button type="button" variant="secondary" size="sm" onClick={copyAddress}>
                {copied ? 'Adressen är kopierad' : 'Kopiera adressen'}
              </Button>
              {copyFailed && <> Kunde inte kopiera. Markera adressen och kopiera den själv.</>}
            </>
          )}
        </p>
      </form>
      )}
    </>
  )
}
