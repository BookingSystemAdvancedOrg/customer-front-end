import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocationInfo } from '../../shared/useLocationInfo'

const SUBJECT_OPTIONS = [
  { value: 'rekommendation', label: 'Rekommendation' },
  { value: 'klagomal', label: 'Klagomål' },
  { value: 'forsaljare', label: 'Försäljare' },
  { value: 'ovrigt', label: 'Övrigt' },
]

/**
 * Kontakt (Figma-förlaga: anars kontakt-sida, github.com/AryaEisa/anar).
 * Precis som originalet finns ingen meddelande-endpoint - formuläret öppnar
 * ett mailto:-utkast i besökarens e-postklient. Mottagaradressen kommer
 * från den publika platsinfon (useLocationInfo) i stället för att vara
 * hårdkodad, så den följer med om adressen ändras i admin.
 */
export default function KontaktPage() {
  const { email } = useLocationInfo()
  const [name, setName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const subjectLabel = useMemo(
    () => SUBJECT_OPTIONS.find((opt) => opt.value === subject)?.label ?? subject,
    [subject],
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const mailSubject = `Kontakt Anar - ${subjectLabel}`
    const mailBody = `Namn: ${name}\nE-post: ${contactEmail}\nÄmne: ${subjectLabel}\n\n${message}`
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`
  }

  return (
    <>
      <section className="photo-hero">
        <p className="hero-kicker">Hör av dig</p>
        <h1>Kontakt</h1>
        <p className="hero-sub">Skicka ett meddelande till oss. Vi återkommer så snart vi kan.</p>
      </section>

      <form className="contact-form" onSubmit={handleSubmit}>
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
          <select
            id="kontakt-subject"
            name="subject"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="" disabled>
              Välj ämne
            </option>
            {SUBJECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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

        <button type="submit" className="btn primary wide">
          Skicka
        </button>
      </form>
    </>
  )
}
