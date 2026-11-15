import { Link } from 'react-router-dom'

/** Länk till kön när inga tider är lediga (visas bara när restaurangen har kö från hemsidan). */
export default function JoinQueueLink(_props: { locationId: string }) {
  return (
    <p>
      Fullt just nu? <Link to="/ko">Ställ dig i kö</Link>, så får du ett sms när ett bord blir ledigt.
    </p>
  )
}
